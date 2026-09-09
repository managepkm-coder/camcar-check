/* 교대 근무표 위젯 — iOS Scriptable 용
 * ───────────────────────────────────────────────────────────
 * 설치
 *  1) App Store에서 "Scriptable"(무료) 설치
 *  2) 앱에서 + 를 눌러 새 스크립트 → 이 파일 전체를 붙여넣기 → 이름을 "근무표"로 저장
 *  3) 홈 화면 빈 곳 길게 누르기 → + → Scriptable → 위젯 추가
 *  4) 추가된 위젯을 길게 눌러 "위젯 편집"
 *       Script    : 근무표
 *       Parameter : 오늘의 근무 한 글자 (주 / 야 / 비 / 휴)
 *     ← Parameter 만 맞추면 나머지 날짜는 전부 자동으로 계산됩니다.
 * ─────────────────────────────────────────────────────────── */

const CYCLE = [
  { k: '주', name: '주간', bg: '#ffd63a', fg: '#3d3300' },
  { k: '야', name: '야간', bg: '#2c2c2e', fg: '#ffffff' },
  { k: '비', name: '비번', bg: '#ffe0dc', fg: '#c9372b' },
  { k: '휴', name: '휴무', bg: '#e9e9ee', fg: '#6b6b73' },
];
const DAY = 86400000;
const ANCHOR = Date.UTC(2026, 7, 30); // 2026-08-30 = 주간
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const startOfToday = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
const baseIndex = (ts) => ((Math.round((ts - ANCHOR) / DAY) % 4) + 4) % 4;

// 위젯 매개변수("주"/"야"/"비"/"휴")로 내 조를 맞춘다
const param = (args.widgetParameter || '').trim();
const want = CYCLE.findIndex((c) => c.k === param);
const OFFSET = want < 0 ? 0 : (want - baseIndex(startOfToday()) + 4) % 4;
const shiftAt = (ts) => CYCLE[(baseIndex(ts) + OFFSET) % 4];

const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const CARD = dyn('#ffffff', '#1c1c1f');
const TEXT = dyn('#2c2c2e', '#f2f2f5');
const MUTED = dyn('#8e8e93', '#9a9aa0');

/** 색 원 안에 근무 글자 */
function badge(parent, item, size, fontSize) {
  const s = parent.addStack();
  s.size = new Size(size, size);
  s.cornerRadius = size / 2;
  s.backgroundColor = new Color(item.bg);
  s.centerAlignContent();
  const t = s.addText(item.k);
  t.font = Font.boldSystemFont(fontSize);
  t.textColor = new Color(item.fg);
  return s;
}

/** 날짜 + 근무 배지를 세로로 쌓은 한 칸 */
function dayColumn(parent, ts, size, fontSize) {
  const d = new Date(ts);
  const col = parent.addStack();
  col.layoutVertically();
  col.centerAlignContent();

  const label = col.addText(`${d.getUTCDate()}${DOW[d.getUTCDay()]}`);
  label.font = Font.mediumSystemFont(10);
  label.textColor = MUTED;
  label.centerAlignText();
  col.addSpacer(3);

  const row = col.addStack();
  row.addSpacer();
  badge(row, shiftAt(ts), size, fontSize);
  row.addSpacer();
}

function build() {
  const w = new ListWidget();
  w.backgroundColor = CARD;
  w.setPadding(14, 14, 14, 14);

  const today = startOfToday();
  const small = config.widgetFamily === 'small' || config.widgetFamily === undefined;
  const ahead = small ? 3 : 6;

  // ── 오늘 ──
  const head = w.addStack();
  head.centerAlignContent();
  badge(head, shiftAt(today), small ? 44 : 50, small ? 22 : 25);
  head.addSpacer(10);

  const info = head.addStack();
  info.layoutVertically();
  const d = new Date(today);
  const dt = info.addText(`${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`);
  dt.font = Font.mediumSystemFont(12);
  dt.textColor = MUTED;
  const nm = info.addText(shiftAt(today).name);
  nm.font = Font.boldSystemFont(small ? 19 : 22);
  nm.textColor = TEXT;
  head.addSpacer();

  w.addSpacer(small ? 10 : 14);

  // ── 앞으로 며칠 ──
  const strip = w.addStack();
  strip.spacing = small ? 6 : 10;
  for (let i = 1; i <= ahead; i++) dayColumn(strip, today + i * DAY, small ? 26 : 32, small ? 13 : 15);
  strip.addSpacer();

  // 자정 직후 새로고침 (기기의 로컬 자정 기준)
  const n = new Date();
  w.refreshAfterDate = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 1, 0);
  return w;
}

const widget = build();
if (config.runsInWidget) Script.setWidget(widget);
else widget.presentSmall();
Script.complete();
