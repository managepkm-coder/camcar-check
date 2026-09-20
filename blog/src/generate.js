import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

/* Claude 로 글을 쓴다.
 * - 구조화 출력(output_config.format)으로 제목/슬러그/요약/태그/본문을 JSON 으로 받는다.
 * - 긴 출력이므로 스트리밍으로 받고 finalMessage() 로 완성본만 쓴다.
 * - 안전 분류기가 요청을 거절하면 서버가 대체 모델로 다시 실행한다 (fallbacks: "default").
 * - BLOG_MOCK=1 이면 API 없이 가짜 글을 만들어 파이프라인만 시험한다. */

export const PostSchema = z.object({
  title: z.string().describe('글 제목. 40자 이내, 검색에 잘 걸리는 구체적인 문장'),
  slug: z.string().describe('URL 슬러그. 영문 소문자·숫자·하이픈만, 60자 이내'),
  summary: z.string().describe('글 요약 2~3문장. 목록과 RSS 에 쓰인다'),
  tags: z.array(z.string()).min(2).max(6).describe('태그 2~6개'),
  body_markdown: z.string().describe('본문 마크다운. ## 소제목으로 구성하고 # 제목은 넣지 않는다'),
});

export const TopicListSchema = z.object({
  topics: z.array(z.object({
    title: z.string(),
    keywords: z.array(z.string()).min(2).max(6),
    notes: z.string().describe('무엇을 다룰지 한두 문장'),
  })),
});

function systemPrompt(config) {
  const { site, author, generation } = config;
  return [
    `당신은 "${site.title}" 블로그의 필자입니다.`,
    site.description && `블로그 소개: ${site.description}`,
    author.persona && `필자 성격과 문체: ${author.persona}`,
    `언어: ${site.language === 'ko' ? '한국어' : site.language}.`,
    '',
    '글쓰기 원칙:',
    `- 본문은 공백 포함 ${generation.minChars}~${generation.maxChars}자.`,
    '- 도입(왜 이 주제인가) → 본론(소제목 3~5개, 구체적인 방법과 예시) → 마무리(핵심 요약과 한 가지 실천 제안) 순서.',
    '- 실제로 해볼 수 있는 구체적인 조언을 쓰고, 뻔한 일반론과 과장은 피한다.',
    '- 의학·법률 등 확실하지 않은 사실은 단정하지 말고 "일반적으로", "전문가와 상의" 같은 표현을 쓴다.',
    '- 광고 문구, 이모지 남발, 클릭베이트 제목은 쓰지 않는다.',
    '- 본문에는 # 제목을 넣지 않는다(제목은 별도 필드). 소제목은 ## 부터 쓴다.',
    '- 이미 발행한 글과 겹치지 않게 새로운 각도로 쓴다.',
  ].filter((l) => l !== undefined && l !== false).join('\n');
}

function topicPrompt(topic, recentTitles) {
  return [
    `다음 글감으로 블로그 글 한 편을 써 주세요.`,
    ``,
    `제목(초안): ${topic.title}`,
    topic.keywords?.length ? `키워드: ${topic.keywords.join(', ')}` : '',
    topic.notes ? `메모: ${topic.notes}` : '',
    recentTitles.length ? `\n최근 발행한 글(중복 금지):\n${recentTitles.map((t) => `- ${t}`).join('\n')}` : '',
    ``,
    `제목은 초안을 다듬어도 됩니다. 슬러그는 영문으로 만들어 주세요.`,
  ].filter(Boolean).join('\n');
}

function mockPost(topic) {
  const slug = 'mock-' + topic.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return {
    title: topic.title,
    slug,
    summary: `${topic.title}에 대한 시험용 글입니다. BLOG_MOCK=1 로 생성되었습니다.`,
    tags: topic.keywords?.length ? topic.keywords.slice(0, 4) : ['테스트', '시험'],
    body_markdown: [
      '## 왜 이 주제인가',
      `${topic.notes || topic.title}`,
      '',
      '## 첫 번째 방법',
      '- 항목 하나\n- 항목 둘',
      '',
      '## 마무리',
      '이 글은 API 호출 없이 만든 자리표시자입니다. `BLOG_MOCK` 을 끄면 Claude 가 실제 글을 씁니다.',
    ].join('\n'),
  };
}

function isMock() {
  return process.env.BLOG_MOCK === '1' || process.env.BLOG_MOCK === 'true';
}

function textOf(message) {
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function checkStop(message, what) {
  if (message.stop_reason === 'refusal') {
    const d = message.stop_details;
    throw new Error(`Claude 가 ${what} 요청을 거절했습니다${d?.category ? ` (분류: ${d.category})` : ''}${d?.explanation ? `: ${d.explanation}` : ''}`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`${what} 출력이 max_tokens 에서 잘렸습니다. generation.maxChars 를 줄이거나 max_tokens 를 늘리세요.`);
  }
}

function client() {
  // ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, 또는 `ant auth login` 프로필을 자동으로 찾는다.
  return new Anthropic();
}

/** 글감 하나로 글 한 편을 생성한다. */
export async function generatePost({ topic, config, recentTitles = [], onText }) {
  if (isMock()) return mockPost(topic);

  const stream = client().beta.messages.stream({
    model: config.generation.model,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: systemPrompt(config), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: topicPrompt(topic, recentTitles) }],
    output_config: {
      effort: config.generation.effort,
      format: zodOutputFormat(PostSchema),
    },
  });
  if (onText) {
    stream.on('text', onText);
  }
  const message = await stream.finalMessage();
  checkStop(message, '글 생성');
  const post = PostSchema.parse(JSON.parse(textOf(message)));
  post.usage = message.usage;
  post.model = message.model;
  return post;
}

/** 큐가 비었을 때 블로그 주제에 맞는 새 글감을 제안받는다. */
export async function suggestTopics({ config, existingTitles = [], count = 5 }) {
  if (isMock()) {
    return Array.from({ length: count }, (_, i) => ({
      title: `시험용 글감 ${i + 1}`,
      keywords: ['테스트', '자동생성'],
      notes: 'BLOG_MOCK=1 로 만든 글감입니다.',
    }));
  }
  const themes = config.generation.themes?.length
    ? `다루는 주제 범위:\n${config.generation.themes.map((t) => `- ${t}`).join('\n')}`
    : '';
  const message = await client().beta.messages.create({
    model: config.generation.model,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: systemPrompt(config),
    messages: [{
      role: 'user',
      content: [
        `이 블로그에 어울리는 새 글감 ${count}개를 제안해 주세요.`,
        themes,
        existingTitles.length ? `이미 쓴 글(겹치지 않게):\n${existingTitles.map((t) => `- ${t}`).join('\n')}` : '',
        '독자가 실제로 검색할 법한 구체적인 질문 형태의 제목이 좋습니다.',
      ].filter(Boolean).join('\n\n'),
    }],
    output_config: { effort: 'medium', format: zodOutputFormat(TopicListSchema) },
  });
  checkStop(message, '글감 제안');
  return TopicListSchema.parse(JSON.parse(textOf(message))).topics.slice(0, count);
}

/** 오류를 사람이 읽을 수 있는 한 줄로 바꾼다. */
export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'API 키가 없거나 잘못되었습니다. ANTHROPIC_API_KEY 를 확인하세요.';
  if (err instanceof Anthropic.RateLimitError) return '요청 한도를 넘었습니다. 잠시 후 다시 시도하세요.';
  if (err instanceof Anthropic.BadRequestError) return `잘못된 요청: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return `API 연결 실패: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API 오류 ${err.status}: ${err.message}`;
  return err?.message || String(err);
}
