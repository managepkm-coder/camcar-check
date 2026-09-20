#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, loadDotenv, paths } from './config.js';
import { loadTopics, saveTopics, addTopic, nextPending, updateTopic } from './topics.js';
import { listPosts, writePost, uniqueSlug, slugify, updatePostMeta } from './post.js';
import { generatePost, suggestTopics, describeError } from './generate.js';
import { publishPost, afterAll } from './publishers/index.js';
import { buildSite } from './build.js';

const HELP = `블로그 자동화

사용법: node src/cli.js <명령> [옵션]

  run                 글감 → 글 생성 → 발행 → 사이트 빌드까지 한 번에 (기본 1편, --count N)
  generate            글감 하나로 원고를 만들어 content/ 에 저장 (--topic <id>)
  publish             생성됐지만 아직 발행 안 된 원고를 발행 (--file <경로>)
  build               content/ 로 정적 사이트 빌드
  topics              글감 큐 보기
  topics add "제목"   글감 추가 (--keywords a,b --notes "메모")
  topics suggest      Claude 에게 새 글감 제안받아 큐에 추가 (--count N)

옵션:
  --mock              API 없이 가짜 글로 파이프라인만 시험 (BLOG_MOCK=1 과 같음)
  --dry-run           발행하지 않고 원고 생성까지만
  --stream            생성 중인 글을 실시간 출력
`;

const log = (...a) => console.log(...a);

function ensureTopic(topics, config, id) {
  let topic = nextPending(topics, id);
  if (!topic && !id) return null;
  if (id && !topic) throw new Error(`글감 ${id} 이(가) 없습니다`);
  return topic;
}

async function fillQueueIfEmpty(topics, config, p) {
  if (nextPending(topics)) return;
  if (!config.generation.autoTopics) return;
  log(`글감 큐가 비어 있어 Claude 에게 ${config.generation.autoTopicCount}개를 제안받습니다…`);
  const existing = [...topics.topics.map((t) => t.title), ...listPosts(p).map((x) => x.meta.title)];
  const suggested = await suggestTopics({ config, existingTitles: existing, count: config.generation.autoTopicCount });
  for (const s of suggested) {
    const t = addTopic(topics, { ...s, source: 'claude' });
    log(`  + ${t.id} ${t.title}`);
  }
  saveTopics(topics, p);
}

async function cmdGenerate({ config, p, topicId, stream }) {
  const topics = loadTopics(p);
  await fillQueueIfEmpty(topics, config, p);
  const topic = ensureTopic(topics, config, topicId);
  if (!topic) { log('생성할 글감이 없습니다. `topics add` 로 추가하거나 generation.autoTopics 를 켜세요.'); return null; }

  log(`✍  글 생성: [${topic.id}] ${topic.title}`);
  const recentTitles = listPosts(p).slice(0, 15).map((x) => x.meta.title);
  let post;
  try {
    post = await generatePost({ topic, config, recentTitles, onText: stream ? (t) => process.stdout.write(t) : undefined });
    if (stream) process.stdout.write('\n');
  } catch (err) {
    updateTopic(topics, topic.id, { status: 'failed', error: describeError(err), failedAt: new Date().toISOString() });
    saveTopics(topics, p);
    throw err;
  }

  const date = new Date().toISOString();
  const slug = uniqueSlug(slugify(post.slug || post.title), p);
  const file = writePost({
    title: post.title, slug, date, tags: post.tags, summary: post.summary,
    topicId: topic.id, status: 'generated', model: post.model,
  }, post.body_markdown, p);
  updateTopic(topics, topic.id, { status: 'generated', file, generatedAt: date, error: undefined });
  saveTopics(topics, p);
  const chars = post.body_markdown.length;
  log(`   저장: ${file} (${chars}자${post.usage ? `, 입력 ${post.usage.input_tokens} / 출력 ${post.usage.output_tokens} 토큰` : ''})`);
  return { file, topic };
}

async function cmdPublish({ config, p, file }) {
  const topics = loadTopics(p);
  const target = file ? path.resolve(file) : null;
  const pending = listPosts(p).filter((x) => (target ? path.resolve(x.file) === target : x.meta.status === 'generated'));
  if (!pending.length) { log('발행할 원고가 없습니다.'); return 0; }
  for (const post of pending) {
    log(`🚀 발행: ${post.meta.title}`);
    const { results, metaPatch } = await publishPost({ post, config, paths: p, log });
    const publishedAt = new Date().toISOString();
    updatePostMeta(post.file, { ...metaPatch, status: 'published', publishedAt });
    if (post.meta.topicId) updateTopic(topics, post.meta.topicId, { status: 'published', publishedAt, results });
  }
  saveTopics(topics, p);
  await afterAll({ config, paths: p });
  return pending.length;
}

async function cmdTopics({ config, p, positionals, values }) {
  const topics = loadTopics(p);
  const sub = positionals[0];
  if (sub === 'add') {
    const title = positionals.slice(1).join(' ');
    if (!title) throw new Error('제목을 적어 주세요: topics add "제목"');
    const t = addTopic(topics, {
      title,
      keywords: values.keywords ? values.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
      notes: values.notes || '',
    });
    saveTopics(topics, p);
    log(`추가됨: ${t.id} ${t.title}`);
    return;
  }
  if (sub === 'suggest') {
    const count = +(values.count || config.generation.autoTopicCount);
    const existing = [...topics.topics.map((t) => t.title), ...listPosts(p).map((x) => x.meta.title)];
    const suggested = await suggestTopics({ config, existingTitles: existing, count });
    for (const s of suggested) { const t = addTopic(topics, { ...s, source: 'claude' }); log(`  + ${t.id} ${t.title}`); }
    saveTopics(topics, p);
    return;
  }
  if (!topics.topics.length) { log('글감이 없습니다.'); return; }
  const icon = { pending: '·', generated: '✍', published: '✓', failed: '✗' };
  for (const t of topics.topics) log(`${icon[t.status] || '?'} ${t.id}  ${t.title}${t.error ? `  (${t.error})` : ''}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      topic: { type: 'string' }, file: { type: 'string' }, count: { type: 'string' },
      keywords: { type: 'string' }, notes: { type: 'string' },
      mock: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, stream: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...rest] = positionals;
  if (!cmd || values.help) { log(HELP); return; }
  if (values.mock) process.env.BLOG_MOCK = '1';

  const p = paths();
  loadDotenv(p.root);
  const config = loadConfig(p);

  switch (cmd) {
    case 'run': {
      const n = +(values.count || config.generation.postsPerRun || 1);
      let made = 0;
      for (let i = 0; i < n; i++) { if (await cmdGenerate({ config, p, stream: values.stream })) made++; else break; }
      if (values['dry-run']) { log(`원고 ${made}편 생성 (dry-run: 발행 생략)`); return; }
      const published = await cmdPublish({ config, p });
      log(`완료: 생성 ${made}편, 발행 ${published}편`);
      return;
    }
    case 'generate': await cmdGenerate({ config, p, topicId: values.topic, stream: values.stream }); return;
    case 'publish': await cmdPublish({ config, p, file: values.file }); return;
    case 'build': { const r = buildSite(config, p); log(`빌드 완료: 글 ${r.count}편 → ${r.index}`); return; }
    case 'topics': await cmdTopics({ config, p, positionals: rest, values }); return;
    default: throw new Error(`알 수 없는 명령: ${cmd}\n${HELP}`);
  }
}

main().catch((err) => {
  console.error('오류:', describeError(err));
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
