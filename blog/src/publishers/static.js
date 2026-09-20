import { buildSite } from '../build.js';

/* 정적 사이트 발행: 원고를 published 로 표시하고 HTML 을 다시 빌드한다.
 * 실제 공개는 git push → GitHub Pages 배포로 이루어진다. */
export const name = 'static';

export async function publish({ post, config, paths }) {
  const base = config.site.url ? config.site.url.replace(/\/?$/, '/') : '';
  return { url: `${base}posts/${post.meta.slug}.html` };
}

export function afterAll({ config, paths }) {
  return buildSite(config, paths);
}
