import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 프로그램 루트. 테스트에서는 BLOG_ROOT 로 바꿔 임시 폴더를 쓴다. */
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function paths(root = process.env.BLOG_ROOT || PKG_ROOT) {
  return {
    root,
    config: path.join(root, 'blog.config.json'),
    topics: path.join(root, 'topics.json'),
    content: path.join(root, 'content'),   // 생성된 마크다운 원고
    posts: path.join(root, 'posts'),       // 빌드된 HTML
    index: path.join(root, 'index.html'),
    feed: path.join(root, 'feed.xml'),
    assets: path.join(PKG_ROOT, 'assets'),
  };
}

const DEFAULTS = {
  site: { title: '블로그', description: '', url: '', language: 'ko' },
  author: { name: '', persona: '' },
  generation: {
    model: 'claude-opus-5',
    effort: 'high',
    postsPerRun: 1,
    minChars: 2500,
    maxChars: 5000,
    autoTopics: true,
    autoTopicCount: 5,
    themes: [],
  },
  publishers: { static: { enabled: true } },
};

/** .env 파일을 읽어 process.env 에 넣는다 (이미 있는 값은 유지). 의존성 없이 처리. */
export function loadDotenv(root = process.env.BLOG_ROOT || PKG_ROOT) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function loadConfig(p = paths()) {
  const raw = fs.existsSync(p.config) ? JSON.parse(fs.readFileSync(p.config, 'utf8')) : {};
  return {
    site: { ...DEFAULTS.site, ...raw.site },
    author: { ...DEFAULTS.author, ...raw.author },
    generation: { ...DEFAULTS.generation, ...raw.generation },
    publishers: { ...DEFAULTS.publishers, ...raw.publishers },
  };
}
