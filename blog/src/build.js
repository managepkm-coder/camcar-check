import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { paths } from './config.js';
import { listPosts } from './post.js';

/* content/*.md → index.html, posts/<slug>.html, feed.xml
 * 저장소 루트가 GitHub Pages 로 배포되므로 blog/ 아래에 곧바로 만든다. */

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (iso) => String(iso).slice(0, 10);

function layout({ config, title, body, depth = 0, description = '' }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="${esc(config.site.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${esc(config.site.title)}" href="${up}feed.xml">
<link rel="stylesheet" href="${up}assets/style.css">
</head>
<body>
<header class="site">
  <a class="brand" href="${up}index.html">${esc(config.site.title)}</a>
  <nav><a href="${up}feed.xml">RSS</a></nav>
</header>
<main>
${body}
</main>
<footer class="site">
  <p>${esc(config.site.title)}${config.author.name ? ` · ${esc(config.author.name)}` : ''}</p>
</footer>
</body>
</html>
`;
}

export function renderMarkdown(md) {
  return marked.parse(md, { gfm: true, breaks: false });
}

function postPage(config, post) {
  const { meta, body } = post;
  const tags = (meta.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');
  return layout({
    config,
    title: `${meta.title} — ${config.site.title}`,
    description: meta.summary,
    depth: 1,
    body: `<article class="post">
  <h1>${esc(meta.title)}</h1>
  <p class="meta"><time datetime="${esc(meta.date)}">${fmtDate(meta.date)}</time> ${tags}</p>
  ${meta.summary ? `<p class="lead">${esc(meta.summary)}</p>` : ''}
  <div class="body">
${renderMarkdown(body)}
  </div>
  <p class="back"><a href="../index.html">← 목록으로</a></p>
</article>`,
  });
}

function indexPage(config, posts) {
  const items = posts.map(({ meta }) => `  <li>
    <a href="./posts/${esc(meta.slug)}.html"><h2>${esc(meta.title)}</h2></a>
    <p class="meta"><time datetime="${esc(meta.date)}">${fmtDate(meta.date)}</time></p>
    ${meta.summary ? `<p>${esc(meta.summary)}</p>` : ''}
  </li>`).join('\n');
  return layout({
    config,
    title: config.site.title,
    description: config.site.description,
    body: `<section class="intro">
  <h1>${esc(config.site.title)}</h1>
  ${config.site.description ? `<p>${esc(config.site.description)}</p>` : ''}
</section>
<ul class="posts">
${items || '  <li><p>아직 글이 없습니다.</p></li>'}
</ul>`,
  });
}

function feed(config, posts) {
  const base = config.site.url ? config.site.url.replace(/\/?$/, '/') : '';
  const items = posts.slice(0, 20).map(({ meta, body }) => `  <item>
    <title>${esc(meta.title)}</title>
    <link>${esc(base)}posts/${esc(meta.slug)}.html</link>
    <guid isPermaLink="false">${esc(meta.slug)}</guid>
    <pubDate>${new Date(meta.date).toUTCString()}</pubDate>
    <description>${esc(meta.summary || '')}</description>
    <content:encoded><![CDATA[${renderMarkdown(body)}]]></content:encoded>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${esc(config.site.title)}</title>
  <link>${esc(base)}</link>
  <description>${esc(config.site.description)}</description>
  <language>${esc(config.site.language)}</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

/** 정적 사이트를 빌드한다. 발행 상태(published)인 글만 노출. */
export function buildSite(config, p = paths()) {
  const posts = listPosts(p).filter((x) => x.meta.status === 'published' || x.meta.status === undefined);
  fs.mkdirSync(p.posts, { recursive: true });

  // 삭제된 원고의 HTML 정리
  const keep = new Set(posts.map((x) => `${x.meta.slug}.html`));
  for (const f of fs.readdirSync(p.posts)) if (f.endsWith('.html') && !keep.has(f)) fs.unlinkSync(path.join(p.posts, f));

  for (const post of posts) fs.writeFileSync(path.join(p.posts, `${post.meta.slug}.html`), postPage(config, post));
  fs.writeFileSync(p.index, indexPage(config, posts));
  fs.writeFileSync(p.feed, feed(config, posts));

  // 스타일시트는 패키지의 assets/ 를 사이트로 복사 (임시 루트에서 빌드할 때 필요)
  const assetsOut = path.join(p.root, 'assets');
  if (path.resolve(assetsOut) !== path.resolve(p.assets)) {
    fs.mkdirSync(assetsOut, { recursive: true });
    fs.copyFileSync(path.join(p.assets, 'style.css'), path.join(assetsOut, 'style.css'));
  }
  return { count: posts.length, index: p.index };
}
