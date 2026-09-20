import * as staticPublisher from './static.js';
import * as wordpress from './wordpress.js';

const REGISTRY = { static: staticPublisher, wordpress };

export function enabledPublishers(config) {
  return Object.entries(config.publishers)
    .filter(([, v]) => v && v.enabled)
    .map(([k]) => {
      if (!REGISTRY[k]) throw new Error(`알 수 없는 발행 대상: ${k} (가능: ${Object.keys(REGISTRY).join(', ')})`);
      return REGISTRY[k];
    });
}

/** 글 하나를 켜져 있는 모든 대상에 발행한다. 결과와 메타 갱신값을 돌려준다. */
export async function publishPost({ post, config, paths, log = () => {} }) {
  const results = {};
  const metaPatch = {};
  for (const pub of enabledPublishers(config)) {
    const r = await pub.publish({ post, config, paths });
    results[pub.name] = { url: r.url, id: r.id, status: r.status };
    Object.assign(metaPatch, r.meta || {});
    log(`  ↳ ${pub.name}: ${r.url || 'ok'}`);
  }
  return { results, metaPatch };
}

export async function afterAll({ config, paths }) {
  for (const pub of enabledPublishers(config)) if (pub.afterAll) await pub.afterAll({ config, paths });
}
