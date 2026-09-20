import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BLOG_MOCK = '1';

const { paths, loadConfig } = await import('../src/config.js');
const { serializePost, parsePost, slugify, writePost, listPosts, uniqueSlug, updatePostMeta } = await import('../src/post.js');
const { loadTopics, saveTopics, addTopic, nextTopicId, nextPending, updateTopic } = await import('../src/topics.js');
const { buildSite, esc } = await import('../src/build.js');
const { generatePost, suggestTopics } = await import('../src/generate.js');

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'));
  fs.writeFileSync(path.join(root, 'blog.config.json'), JSON.stringify({
    site: { title: '테스트 블로그', description: '설명', url: 'https://example.com/blog/', language: 'ko' },
    generation: { model: 'claude-opus-5' },
    publishers: { static: { enabled: true } },
  }));
  fs.writeFileSync(path.join(root, 'topics.json'), JSON.stringify({ topics: [] }));
  return paths(root);
}

test('front matter 를 쓰고 그대로 읽는다', () => {
  const meta = { title: '따옴표 "있는" 제목', slug: 'a-b', date: '2026-01-02T03:04:05.000Z', tags: ['하나', '둘'] };
  const { meta: back, body } = parsePost(serializePost(meta, '## 본문\n\n내용'));
  assert.deepEqual(back, meta);
  assert.match(body, /## 본문/);
});

test('slugify 는 URL 에 안전한 문자만 남긴다', () => {
  assert.equal(slugify('Hello, World! 2026'), 'hello-world-2026');
  assert.equal(slugify('---'), 'post');
  assert.ok(slugify('a'.repeat(200)).length <= 80);
});

test('uniqueSlug 는 겹치는 슬러그에 번호를 붙인다', () => {
  const p = tmpRoot();
  writePost({ title: 'A', slug: 'dup', date: '2026-01-01T00:00:00.000Z', tags: [], status: 'published' }, '본문', p);
  assert.equal(uniqueSlug('dup', p), 'dup-2');
  assert.equal(uniqueSlug('other', p), 'other');
});

test('글감 큐는 id 를 늘려가며 상태를 기록한다', () => {
  const p = tmpRoot();
  const topics = loadTopics(p);
  const a = addTopic(topics, { title: '첫 글감' });
  const b = addTopic(topics, { title: '둘째 글감' });
  assert.equal(a.id, 't-001');
  assert.equal(b.id, 't-002');
  assert.equal(nextTopicId(topics), 't-003');
  assert.equal(nextPending(topics).id, 't-001');
  updateTopic(topics, 't-001', { status: 'published' });
  assert.equal(nextPending(topics).id, 't-002');
  saveTopics(topics, p);
  assert.equal(loadTopics(p).topics.length, 2);
});

test('mock 생성기는 스키마에 맞는 글을 돌려준다', async () => {
  const p = tmpRoot();
  const config = loadConfig(p);
  const post = await generatePost({ topic: { id: 't-001', title: '제목', keywords: ['가'], notes: '메모' }, config });
  assert.equal(post.title, '제목');
  assert.ok(post.body_markdown.includes('##'));
  assert.ok(Array.isArray(post.tags) && post.tags.length >= 1);
  const topics = await suggestTopics({ config, count: 3 });
  assert.equal(topics.length, 3);
});

test('빌드는 발행된 글만 목록·RSS 에 넣는다', () => {
  const p = tmpRoot();
  const config = loadConfig(p);
  writePost({ title: '발행글', slug: 'live', date: '2026-02-02T00:00:00.000Z', tags: ['태그'], summary: '요약', status: 'published' }, '## 소제목\n\n본문', p);
  writePost({ title: '초안', slug: 'draft', date: '2026-02-03T00:00:00.000Z', tags: [], summary: '', status: 'generated' }, '초안 본문', p);

  const result = buildSite(config, p);
  assert.equal(result.count, 1);
  const index = fs.readFileSync(p.index, 'utf8');
  assert.ok(index.includes('발행글'));
  assert.ok(!index.includes('초안'));
  assert.ok(fs.existsSync(path.join(p.posts, 'live.html')));
  assert.ok(!fs.existsSync(path.join(p.posts, 'draft.html')));

  const page = fs.readFileSync(path.join(p.posts, 'live.html'), 'utf8');
  assert.ok(page.includes('<h2>소제목</h2>'));
  const feed = fs.readFileSync(p.feed, 'utf8');
  assert.ok(feed.includes('https://example.com/blog/posts/live.html'));
  assert.ok(fs.existsSync(path.join(p.root, 'assets', 'style.css')));
});

test('빌드는 삭제된 원고의 HTML 을 지운다', () => {
  const p = tmpRoot();
  const config = loadConfig(p);
  const file = writePost({ title: '지울 글', slug: 'gone', date: '2026-03-01T00:00:00.000Z', tags: [], status: 'published' }, '본문', p);
  buildSite(config, p);
  assert.ok(fs.existsSync(path.join(p.posts, 'gone.html')));
  fs.unlinkSync(file);
  buildSite(config, p);
  assert.ok(!fs.existsSync(path.join(p.posts, 'gone.html')));
});

test('제목과 요약의 HTML 특수문자는 이스케이프된다', () => {
  const p = tmpRoot();
  const config = loadConfig(p);
  writePost({ title: '<script>alert(1)</script>', slug: 'xss', date: '2026-04-01T00:00:00.000Z', tags: [], summary: 'a & b', status: 'published' }, '본문', p);
  buildSite(config, p);
  const index = fs.readFileSync(p.index, 'utf8');
  assert.ok(!index.includes('<script>alert(1)</script>'));
  assert.ok(index.includes('&lt;script&gt;'));
  assert.ok(index.includes('a &amp; b'));
  assert.equal(esc('<"&>'), '&lt;&quot;&amp;&gt;');
});

test('updatePostMeta 는 본문을 보존한 채 메타만 바꾼다', () => {
  const p = tmpRoot();
  const file = writePost({ title: 'T', slug: 's', date: '2026-05-01T00:00:00.000Z', tags: [], status: 'generated' }, '원래 본문', p);
  updatePostMeta(file, { status: 'published', wordpressId: 42 });
  const [post] = listPosts(p);
  assert.equal(post.meta.status, 'published');
  assert.equal(post.meta.wordpressId, 42);
  assert.equal(post.body, '원래 본문');
});
