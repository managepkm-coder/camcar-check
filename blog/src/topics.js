import fs from 'node:fs';
import { paths } from './config.js';

/** topics.json — 글감 큐. status: pending → generated → published (실패 시 failed) */
export function loadTopics(p = paths()) {
  if (!fs.existsSync(p.topics)) return { topics: [] };
  const data = JSON.parse(fs.readFileSync(p.topics, 'utf8'));
  data.topics ||= [];
  return data;
}

export function saveTopics(data, p = paths()) {
  fs.writeFileSync(p.topics, JSON.stringify(data, null, 2) + '\n');
}

export function nextTopicId(data) {
  const nums = data.topics.map((t) => +(String(t.id).match(/(\d+)$/)?.[1] ?? 0));
  return `t-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
}

export function addTopic(data, { title, keywords = [], notes = '', source = 'manual' }) {
  const topic = { id: nextTopicId(data), title, keywords, notes, status: 'pending', source, addedAt: new Date().toISOString() };
  data.topics.push(topic);
  return topic;
}

export function nextPending(data, id) {
  if (id) return data.topics.find((t) => t.id === id) ?? null;
  return data.topics.find((t) => t.status === 'pending') ?? null;
}

export function updateTopic(data, id, patch) {
  const t = data.topics.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  return t;
}
