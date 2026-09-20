# 블로그 자동화

Claude 가 글감을 고르고, 글을 쓰고, 정적 사이트로 발행하는 프로그램입니다.
GitHub Actions 가 정해진 요일에 자동으로 돌려 주므로 평소에는 손댈 일이 없습니다.

```
topics.json ──▶ Claude ──▶ content/*.md ──▶ posts/*.html + index.html + feed.xml
  글감 큐       글 생성       마크다운 원고          발행된 사이트
```

## 빠르게 시작하기

```bash
cd blog
npm install
cp .env.example .env          # ANTHROPIC_API_KEY 를 채웁니다

node src/cli.js run --mock    # API 없이 파이프라인만 시험
node src/cli.js run           # 실제로 한 편 쓰고 발행
```

`run` 은 글감 큐에서 하나를 꺼내 글을 쓰고, 발행하고, 사이트를 다시 빌드합니다.
큐가 비어 있으면 Claude 에게 새 글감을 제안받아 채웁니다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `run` | 생성 → 발행 → 빌드까지 한 번에. `--count N` 으로 여러 편 |
| `generate` | 원고만 만들어 `content/` 에 저장. `--topic t-003` 으로 글감 지정 |
| `publish` | 아직 발행 안 된 원고를 발행 |
| `build` | `content/` 로 사이트만 다시 빌드 |
| `topics` | 글감 큐 보기 |
| `topics add "제목"` | 글감 추가. `--keywords 수면,회복 --notes "메모"` |
| `topics suggest` | Claude 에게 글감 제안받기. `--count 5` |

공통 옵션: `--mock`(API 없이), `--dry-run`(발행 생략), `--stream`(생성 과정 실시간 출력).

## 설정

`blog.config.json` 하나로 제어합니다.

```jsonc
{
  "site":   { "title": "블로그 이름", "description": "…", "url": "…", "language": "ko" },
  "author": { "name": "글쓴이", "persona": "말투와 성격을 적으면 글에 반영됩니다" },
  "generation": {
    "model": "claude-opus-5",   // 글을 쓰는 모델
    "effort": "high",           // low · medium · high · xhigh · max
    "postsPerRun": 1,           // run 한 번에 쓸 글 수
    "minChars": 2500,           // 본문 길이 목표
    "maxChars": 5000,
    "autoTopics": true,         // 큐가 비면 글감을 자동으로 제안받는다
    "themes": ["다룰 주제들 …"]  // 글감 제안의 범위
  },
  "publishers": {
    "static":    { "enabled": true },
    "wordpress": { "enabled": false, "status": "draft", "categories": [] }
  }
}
```

문체를 바꾸고 싶으면 `author.persona` 와 `src/generate.js` 의 `systemPrompt` 를 고치면 됩니다.

## 글감 큐

`topics.json` 의 각 글감은 `pending → generated → published` 순으로 상태가 바뀝니다.
생성이 실패하면 `failed` 로 표시되고 이유가 함께 남으므로, 고친 뒤 `pending` 으로 되돌리면 다시 시도합니다.

```bash
node src/cli.js topics add "교대근무자의 아침 식사" --keywords 식사,건강
node src/cli.js topics suggest --count 5
```

## 자동 실행

`.github/workflows/blog.yml` 이 매주 월·목 한국시간 오전 8시에 글을 한 편 씁니다.
저장소 `Settings → Secrets and variables → Actions` 에 **`ANTHROPIC_API_KEY`** 를 넣어야 동작합니다.

워크플로는 글을 쓰고 → 저장소에 커밋하고 → GitHub Pages 로 배포까지 합니다.
`Actions → Publish blog post → Run workflow` 로 손수 돌릴 수도 있고, 이때 글 수와 `dry-run` 을 고를 수 있습니다.

주기를 바꾸려면 워크플로의 `cron` 을 고치세요. 시간은 UTC 기준이라 한국시간에서 9시간을 뺍니다.

## 발행 대상

**정적 사이트** (기본) — `posts/*.html`, `index.html`, `feed.xml` 을 만들고 GitHub Pages 로 나갑니다.
발행 주소는 `<저장소 Pages 주소>/blog/` 입니다.

**워드프레스** (선택) — `publishers.wordpress.enabled` 를 켜고 아래 값을 Secrets 에 넣으면 REST API 로 함께 올립니다.

| 값 | 설명 |
|---|---|
| `WP_URL` | `https://example.com` |
| `WP_USER` | 워드프레스 아이디 |
| `WP_APP_PASSWORD` | 사용자 → 프로필 → 응용 프로그램 비밀번호에서 발급 |

`status` 를 `draft` 로 두면 초안으로만 올라가므로, 사람이 확인한 뒤 공개할 수 있습니다.
태그는 이름으로 찾아 없으면 새로 만듭니다. 같은 글을 다시 발행하면 기존 글을 수정합니다.

다른 곳(티스토리, 네이버 등)에 올리려면 `src/publishers/` 에 파일을 하나 더 만들고
`publish({ post, config })` 를 내보낸 뒤 `src/publishers/index.js` 의 `REGISTRY` 에 등록하면 됩니다.

## 원고 형식

`content/YYYY-MM-DD-slug.md` 는 front matter 와 본문으로 되어 있습니다.
값은 JSON 으로 적혀 있어 따옴표가 든 제목도 안전합니다.

```markdown
---
title: "야간 근무 다음 날, 낮잠은 몇 시간이 적당할까"
slug: "night-shift-nap"
date: "2026-09-20T00:00:00.000Z"
tags: ["야간근무","수면"]
summary: "…"
status: "published"
---

## 소제목

본문…
```

발행 전에 원고를 직접 고쳐도 됩니다. `status` 가 `published` 인 글만 사이트에 보입니다.
글을 내리려면 `content/` 에서 파일을 지우고 `build` 를 다시 돌리면 HTML 도 함께 정리됩니다.

## 비용

글 한 편은 보통 입력 1천 토큰 안팎, 출력 3~5천 토큰입니다.
`claude-opus-5` 기준으로 한 편에 몇 백 원 수준이고, 주 2회면 한 달에 커피 한 잔 정도입니다.
`generation.effort` 를 `medium` 으로 낮추면 더 저렴해집니다.

## 테스트

```bash
npm test
```

API 호출 없이(`BLOG_MOCK=1`) 임시 폴더에서 원고 저장, 글감 큐, 빌드, HTML 이스케이프를 확인합니다.
