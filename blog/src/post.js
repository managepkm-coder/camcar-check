import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.js';

/* 마크다운 원고 파일: `---` 로 감싼 front matter + 본문.
 * front matter 값은 JSON 으로 적어 파서 없이 안전하게 읽고 쓴다. (title: "…", tags: ["a","b"]) */

export function slugify(input) {
  const s = String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'post';
}

export function serializePost(meta, body) {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}

export function parsePost(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    try { meta[key] = JSON.parse(raw); } catch { meta[key] = raw; }
  }
  return { meta, body: m[2].trim() };
}

export function postFilename(date, slug) {
  return `${date.slice(0, 10)}-${slug}.md`;
}

export function writePost(meta, body, p = paths()) {
  fs.mkdirSync(p.content, { recursive: true });
  const file = path.join(p.content, postFilename(meta.date, meta.slug));
  fs.writeFileSync(file, serializePost(meta, body));
  return file;
}

export function readPost(file) {
  const { meta, body } = parsePost(fs.readFileSync(file, 'utf8'));
  return { file, meta, body };
}

/** content/ 의 모든 원고. 날짜 내림차순. */
export function listPosts(p = paths()) {
  if (!fs.existsSync(p.content)) return [];
  return fs.readdirSync(p.content)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readPost(path.join(p.content, f)))
    .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));
}

export function updatePostMeta(file, patch) {
  const { meta, body } = readPost(file);
  fs.writeFileSync(file, serializePost({ ...meta, ...patch }, body));
}

/** 같은 slug 가 이미 있으면 -2, -3 … 을 붙인다. */
export function uniqueSlug(slug, p = paths()) {
  const taken = new Set(listPosts(p).map((x) => x.meta.slug));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}
