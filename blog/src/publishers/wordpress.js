import { renderMarkdown } from '../build.js';

/* 워드프레스 REST API 발행. 응용 프로그램 비밀번호(Application Password)를 쓴다.
 * 환경변수: WP_URL, WP_USER, WP_APP_PASSWORD
 * 설정: publishers.wordpress = { enabled, status: "draft" | "publish", categories: [id...] } */
export const name = 'wordpress';

function env(key) {
  const v = process.env[key];
  if (!v) throw new Error(`${key} 환경변수가 없습니다 (워드프레스 발행에 필요)`);
  return v;
}

function api(base, user, pass) {
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  return async (method, route, body) => {
    const res = await fetch(`${base.replace(/\/$/, '')}/wp-json/wp/v2${route}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!res.ok) throw new Error(`워드프레스 ${method} ${route} 실패 (${res.status}): ${json?.message || text.slice(0, 200)}`);
    return json;
  };
}

/** 태그 이름 → ID. 없으면 만든다. */
async function ensureTags(call, names) {
  const ids = [];
  for (const n of names) {
    const found = await call('GET', `/tags?search=${encodeURIComponent(n)}&per_page=20`);
    const exact = found.find((t) => t.name.toLowerCase() === n.toLowerCase());
    if (exact) { ids.push(exact.id); continue; }
    const created = await call('POST', '/tags', { name: n });
    ids.push(created.id);
  }
  return ids;
}

export async function publish({ post, config }) {
  const opts = config.publishers.wordpress || {};
  const call = api(env('WP_URL'), env('WP_USER'), env('WP_APP_PASSWORD'));

  // 이미 올린 글이면 갱신
  const existing = post.meta.wordpressId;
  const body = {
    title: post.meta.title,
    content: renderMarkdown(post.body),
    excerpt: post.meta.summary || '',
    status: opts.status || 'draft',
    slug: post.meta.slug,
    tags: await ensureTags(call, post.meta.tags || []),
  };
  if (opts.categories?.length) body.categories = opts.categories;

  const result = existing
    ? await call('POST', `/posts/${existing}`, body)
    : await call('POST', '/posts', body);
  return { url: result.link, id: result.id, status: result.status, meta: { wordpressId: result.id } };
}
