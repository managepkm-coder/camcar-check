/* 우리집 보험 — 월 납입액과 납입기간을 한눈에
 *
 * 서버 없이 이 기기(localStorage)에만 저장합니다.
 * 가족끼리는 설정 → 백업 파일을 카톡 등으로 보내고 '불러오기' 하면 같은 화면을 볼 수 있습니다.
 *
 * 날짜는 전부 "월 번호"(연*12 + 월-1) 정수로 계산합니다.  2018-03 → 2018*12 + 2
 */
'use strict';

const KEY = 'insure.v1';
const UI_KEY = 'insure.ui';
const SLOTS = 8; // 가족 색 개수 (style.css 의 --m0 ~ --m7)

const TYPES = ['실손', '건강', '암', '종신', '정기', '연금', '저축', '어린이', '운전자', '간병', '치아', '화재', '자동차', '기타'];
const INSURERS = [
  '삼성생명', '한화생명', '교보생명', '신한라이프', 'NH농협생명', '동양생명', '미래에셋생명', '흥국생명', 'KB라이프',
  'DB생명', 'ABL생명', '메트라이프', 'AIA생명', '라이나생명', '푸본현대생명', 'KDB생명', '처브라이프', 'iM라이프',
  '삼성화재', '현대해상', 'DB손해보험', 'KB손해보험', '메리츠화재', '한화손해보험', '롯데손해보험', '흥국화재',
  'NH농협손해보험', '하나손해보험', 'AXA손해보험', '우체국보험', '새마을금고', '신협',
];

/* ── 작은 도구들 ── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const digits = (s) => +String(s ?? '').replace(/[^\d]/g, '') || 0;
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** '2018-03', '2018.3', '201803', '2018년 3월' → 월 번호. 못 읽으면 null */
function ym(s) {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return s;
  const m = String(s).trim().match(/^(\d{4})(?:\D*(\d{1,2}))?/);
  if (!m) return null;
  const mo = m[2] ? +m[2] : 1;
  return mo >= 1 && mo <= 12 ? +m[1] * 12 + mo - 1 : null;
}
const ymStr = (i) => (i == null ? '' : `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`);
const ymDot = (i) => `${Math.floor(i / 12)}.${pad((i % 12) + 1)}`;
const nowIdx = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };
const dur = (m) => [Math.floor(m / 12) && `${Math.floor(m / 12)}년`, m % 12 && `${m % 12}개월`].filter(Boolean).join(' ') || '0개월';
const manwon = (n) => {
  n = Math.round(n);
  if (n < 10000) return `${won(n)}원`;
  const r = n % 10000;
  return `${won(Math.floor(n / 10000))}만${r ? ' ' + won(r) : ''}원`;
};

/* ── 저장소 ── */
let NOW = nowIdx();
let db = load();
let ui = (() => { try { return { who: 'all', view: 'timeline', ...JSON.parse(localStorage.getItem(UI_KEY)) }; } catch { return { who: 'all', view: 'timeline' }; } })();

function blank() { return { members: [{ id: uid(), name: '본인', birth: null, slot: 0 }], policies: [] }; }
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.members) && d.members.length) return normalize(d); } catch {}
  return blank();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { alert('저장 공간이 부족해 저장하지 못했어요.'); } }
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} }

/** 불러온 데이터의 모양을 맞춘다 (백업 파일이 오래됐거나 손으로 고친 경우 대비) */
function normalize(d) {
  const members = (Array.isArray(d.members) ? d.members : []).filter((m) => m && m.name).map((m) => ({
    id: String(m.id || uid()), name: String(m.name).slice(0, 12), birth: +m.birth || null, slot: Number.isInteger(m.slot) ? m.slot : null,
  }));
  if (!members.length) members.push(...blank().members);
  const used = new Set();
  for (const m of members) {
    if (m.slot == null || used.has(m.slot) || m.slot < 0 || m.slot >= SLOTS) m.slot = [...Array(SLOTS).keys()].find((i) => !used.has(i)) ?? 0;
    used.add(m.slot);
  }
  const ids = new Set(members.map((m) => m.id));
  const policies = (Array.isArray(d.policies) ? d.policies : []).filter((p) => p && typeof p === 'object').map((p) => ({
    id: String(p.id || uid()),
    who: ids.has(p.who) ? p.who : members[0].id,
    insurer: String(p.insurer || ''), name: String(p.name || p.insurer || '보험'), product: String(p.product || ''),
    type: String(p.type || '기타'), premium: +p.premium || 0, cycle: p.cycle === 'Y' ? 'Y' : 'M',
    start: ymStr(ym(p.start)), end: ymStr(ym(p.end)), cover: String(p.cover || ''), payday: +p.payday || null,
    payStart: ymStr(ym(p.payStart)), payYears: +p.payYears || null, payAmt: +p.payAmt || null,
    cancel: ymStr(ym(p.cancel)), memo: String(p.memo || ''),
  }));
  return { members, policies };
}

const member = (id) => db.members.find((m) => m.id === id) || db.members[0];
const ageAt = (m, i) => (m && m.birth ? Math.floor(i / 12) - m.birth : null);
const nextSlot = () => { const u = new Set(db.members.map((m) => m.slot)); return [...Array(SLOTS).keys()].find((i) => !u.has(i)) ?? db.members.length % SLOTS; };

/* ── 계산: 보험 하나의 납입 현황 ── */
let memo = new Map();
function calc(p) {
  let k = memo.get(p);
  if (!k) { k = compute(p); memo.set(p, k); }
  return k;
}
function compute(p) {
  const s = ym(p.start), c = ym(p.cancel);
  let e = ym(p.end);
  if (c != null) e = e == null ? c - 1 : Math.min(e, c - 1); // 해지한 달부터는 안 냄
  const per = p.cycle === 'Y' ? 12 : 1;

  let status = 'paying';
  if (c != null && c <= NOW) status = 'cancelled';
  else if (s != null && NOW < s) status = 'before';
  else if (e != null && NOW > e) status = 'done';

  let totalN = Infinity, paidN = null, remainN;
  if (s != null) {
    totalN = e != null ? Math.max(0, Math.floor((e - s) / per) + 1) : Infinity;
    paidN = Math.max(0, Math.min(totalN, Math.floor((Math.min(NOW, e ?? NOW) - s) / per) + 1));
    remainN = totalN - paidN;
  } else {
    // 시작 월을 모르면 낸 횟수는 모르고, 남은 횟수만 끝 월로 계산한다
    remainN = e != null ? Math.max(0, Math.floor((e - NOW) / per)) : Infinity;
  }
  if (status === 'cancelled') remainN = 0;
  return {
    s, e, c, per, status, totalN, paidN, remainN,
    monthly: p.premium / per, // 연납은 월로 환산
    paidAmt: (paidN ?? 0) * p.premium,
    remainAmt: Number.isFinite(remainN) ? remainN * p.premium : null,
    pct: paidN != null && Number.isFinite(totalN) && totalN > 0 ? paidN / totalN : null,
    left: e != null ? Math.max(0, e - NOW) : null, // 이번 달 다음부터 남은 개월
  };
}
const payLabel = (k) => {
  if (k.e == null) return '갱신형';
  if (k.s == null) return '';
  const n = k.e - k.s + 1;
  return n % 12 === 0 ? `${n / 12}년납` : `${dur(n)}납`;
};

/* ── 화면 ── */
function render() {
  NOW = nowIdx();
  memo = new Map();
  if (ui.who !== 'all' && !db.members.some((m) => m.id === ui.who)) ui.who = 'all';
  if (db.members.length === 1) ui.who = 'all';

  const list = db.policies.filter((p) => ui.who === 'all' || p.who === ui.who);
  const live = list.filter((p) => calc(p).status !== 'cancelled');
  const gone = list.filter((p) => calc(p).status === 'cancelled');
  const empty = !db.policies.length;

  renderChips();
  $('#summary').innerHTML = empty ? '' : summaryHTML(list);
  $('#seg').hidden = empty;
  $$('#seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === ui.view)));
  $('#content').innerHTML = empty ? emptyHTML()
    : !live.length ? '<p class="none">등록된 보험이 없어요.</p>'
    : ui.view === 'list' ? live.slice().sort(byStatusThenPremium).map(cardHTML).join('')
    : timelineHTML(live);
  $('#events').innerHTML = empty ? '' : eventsHTML(live);
  $('#payouts').innerHTML = empty ? '' : payoutsHTML(live);
  $('#cancelled').innerHTML = gone.length
    ? `<details class="gone"><summary>해지한 보험 ${gone.length}건 <small>지금까지 ${won(gone.reduce((a, p) => a + calc(p).paidAmt, 0))}원 냄</small></summary>${gone.map(cardHTML).join('')}</details>`
    : '';
}

const ORDER = { paying: 0, before: 1, done: 2, cancelled: 3 };
function byStatusThenPremium(a, b) {
  const ka = calc(a), kb = calc(b);
  return ORDER[ka.status] - ORDER[kb.status] || kb.monthly - ka.monthly;
}

function renderChips() {
  const el = $('#chips');
  if (db.members.length === 1) {
    el.innerHTML = '<button class="chip add" data-act="addMember">＋ 가족 보험도 같이 보기</button>';
    return;
  }
  el.innerHTML = `<button class="chip${ui.who === 'all' ? ' on' : ''}" data-who="all">전체</button>`
    + db.members.map((m) => `<button class="chip${ui.who === m.id ? ' on' : ''}" data-who="${m.id}" style="--c:var(--m${m.slot})"><i></i>${esc(m.name)}</button>`).join('')
    + '<button class="chip add" data-act="addMember" aria-label="가족 추가">＋</button>';
}

function summaryHTML(list) {
  let monthly = 0, paid = 0, remain = 0, nPay = 0, nDone = 0, nOpen = 0, nNoStart = 0;
  for (const p of list) {
    const k = calc(p);
    paid += k.paidAmt;
    if (k.paidN == null) nNoStart++;
    if (k.status === 'paying') { monthly += k.monthly; nPay++; }
    if (k.status === 'done') nDone++;
    if (k.status === 'paying' || k.status === 'before') { if (k.remainAmt == null) nOpen++; else remain += k.remainAmt; }
  }
  const m = ui.who === 'all' ? null : member(ui.who);
  const title = m ? `${esc(m.name)} 월 보험료` : db.members.length > 1 ? '가족 전체 월 보험료' : '매달 나가는 보험료';

  let family = '';
  if (!m && db.members.length > 1) {
    const rows = db.members.map((mb) => {
      let s = 0, n = 0;
      for (const p of db.policies) if (p.who === mb.id) { const k = calc(p); if (k.status === 'paying') { s += k.monthly; n++; } }
      return { mb, s, n };
    });
    family = `<div class="stack" aria-hidden="true">${rows.filter((r) => r.s > 0).map((r) => `<i style="flex-grow:${r.s.toFixed(0)};background:var(--m${r.mb.slot})"></i>`).join('')}</div>
      <div class="legend">${rows.map((r) => `<button class="leg" data-who="${r.mb.id}" style="--c:var(--m${r.mb.slot})">
        <i></i><span>${esc(r.mb.name)}<small>${r.n}건${r.mb.birth ? ` · ${ageAt(r.mb, NOW)}세` : ''}</small></span>
        <b>${won(r.s)}원</b><em>${monthly ? Math.round((r.s / monthly) * 100) : 0}%</em></button>`).join('')}</div>`;
  }

  return `<div class="card sum">
    <div class="sum-label">${title}</div>
    <div class="hero">${won(monthly)}<span>원</span></div>
    <div class="sum-sub">1년이면 ${manwon(monthly * 12)} · 내는 중 ${nPay}건${nDone ? ` · 완납 ${nDone}건` : ''}</div>
    ${family}
    <div class="stats">
      <div><small>지금까지 낸 돈</small><b>${manwon(paid)}</b>${nNoStart ? `<em>시작 월 모르는 ${nNoStart}건 빼고</em>` : ''}</div>
      <div><small>앞으로 낼 돈</small><b>${manwon(remain)}</b>${nOpen ? `<em>갱신형 ${nOpen}건 빼고</em>` : ''}</div>
    </div>
  </div>`;
}

/* 손으로 그리던 표 그대로: 왼쪽 보험 이름, 가운데 납입기간 막대, 오른쪽 월납입액, 맨 아래 합계 */
function timelineHTML(list) {
  let rows = list.map((p) => ({ p, k: calc(p), m: member(p.who) }));
  // 지난 일은 최근 4년만 보여 주고, 화면 폭은 앞으로 남은 기간에 쓴다
  const starts = rows.map((r) => r.k.s).filter((s) => s != null);
  let d0 = Math.max(starts.length ? Math.min(...starts) : NOW - 48, NOW - 48);
  let d1 = NOW + 12;
  for (const { k } of rows) if (k.e != null) d1 = Math.max(d1, k.e + 1);
  d1 += 24;
  for (const { p } of rows) { const ps = ym(p.payStart); if (ps != null) d1 = Math.max(d1, ps + 36); }
  d0 = Math.floor(d0 / 12) * 12;
  d1 = Math.ceil(d1 / 12) * 12;
  const hidden = rows.filter((r) => r.k.e != null && r.k.e + 1 <= d0).length; // 오래전에 다 낸 보험
  rows = rows.filter((r) => !(r.k.e != null && r.k.e + 1 <= d0));
  if (!rows.length) return '<p class="none">지금 내고 있는 보험이 없어요. ‘보험별 상세’에서 완납한 보험을 볼 수 있어요.</p>';
  const span = d1 - d0;
  const X = (i) => Math.max(0, Math.min(100, ((i - d0) / span) * 100));
  const pc = (v) => `${v.toFixed(2)}%`;

  // 눈금 간격: 연도 글자가 겹치지 않을 만큼 (화면 폭으로 그래프 폭을 어림)
  const w = Math.min(window.innerWidth, 560);
  const plotW = w - 56 - (w <= 370 ? 150 : w >= 500 ? 212 : 174);
  const step = [1, 2, 5, 10, 20].find((st) => (plotW * st * 12) / span >= 34) || 20;
  const ticks = [];
  for (let y = Math.ceil(d0 / 12 / step) * step; y * 12 < d1; y += step) { const x = X(y * 12); if (x > 4 && x < 96) ticks.push(y); }
  const focus = ui.who !== 'all' ? member(ui.who) : db.members[0];
  const today = NOW + (new Date().getDate() - 1) / 31;

  rows.sort((a, b) => db.members.indexOf(a.m) - db.members.indexOf(b.m) || (a.k.e ?? Infinity) - (b.k.e ?? Infinity) || b.k.monthly - a.k.monthly);
  const multi = new Set(rows.map((r) => r.m.id)).size > 1;

  let body = '', last = null, total = 0;
  for (const { p, k, m } of rows) {
    if (multi && m !== last) {
      last = m;
      const sum = rows.filter((r) => r.m === m && r.k.status === 'paying').reduce((a, r) => a + r.k.monthly, 0);
      body += `<div class="tl-group"><i style="background:var(--m${m.slot})"></i>${esc(m.name)}<span>${won(sum)}</span></div>`;
    }
    if (k.status === 'paying') total += k.monthly;
    const open = k.e == null;
    const x0 = k.s != null ? X(k.s) : 0, x1 = open ? 100 : X(k.e + 1);
    const cut = k.s == null || k.s < d0; // 화면 왼쪽보다 먼저 시작했거나 시작 월을 모름
    let marks = `<i class="bar${open ? ' open' : ''}${cut ? ' cut' : ''}${k.status === 'done' ? ' done' : ''}" style="left:${pc(x0)};width:${pc(Math.max(x1 - x0, 0.6))}"></i>`;
    if (!open) marks += `<i class="dot${k.status === 'done' ? ' done' : ''}" style="left:${pc(x1)}"></i>`;

    const ps = ym(p.payStart);
    let tip = `${p.name} · ${k.s != null ? ymDot(k.s) : '시작 모름'} ~ ${open ? '계속' : ymDot(k.e)} · ${p.cycle === 'Y' ? '연' : '월'} ${won(p.premium)}원`;
    if (ps != null) {
      const pe = p.payYears ? ps + p.payYears * 12 : d1;
      marks += `<i class="recv${pe >= d1 ? ' open' : ''}" style="left:${pc(X(ps))};width:${pc(Math.max(X(pe) - X(ps), 0.6))}"></i>`;
      tip += ` · ${ymDot(ps)}부터 ${p.payYears ? `${p.payYears}년간` : '평생'} 받음`;
    }
    const age = ageAt(focus, open ? NOW : k.e);
    const lbl = open ? '갱신형 · 계속' : k.status === 'done' ? `${Math.floor(k.e / 12)} 완납` : `${Math.floor(k.e / 12)}${age != null ? ` · ${age}세` : ''}`;
    const lx = open ? x0 : x1;
    const amt = k.status === 'done' ? '완납' : won(k.monthly);
    body += `<button class="tl-row ${k.status}" data-id="${p.id}" style="--c:var(--m${m.slot})" title="${esc(tip)}">
      <span class="tl-name"><b>${esc(p.name)}</b><small>${esc(p.insurer)}${p.cycle === 'Y' ? ' · 연납' : ''}</small></span>
      <span class="tl-track">${marks}<em class="lbl${lx > 62 ? ' r' : ''}" style="left:${pc(lx)}">${lbl}</em></span>
      <span class="tl-amt">${amt}</span></button>`;
  }

  return `<div class="card tl-card">
  <div class="tl">
    <div class="tl-grid" aria-hidden="true">${ticks.map((y) => `<i style="left:${pc(X(y * 12))}"></i>`).join('')}<i class="now" style="left:${pc(X(today))}"></i></div>
    <div class="tl-axis"><span class="tl-h">보험</span><span class="tl-track">${ticks.map((y) => {
      const a = ageAt(focus, y * 12);
      return `<em style="left:${pc(X(y * 12))}">${y}${a != null ? `<small>${a}세</small>` : ''}</em>`;
    }).join('')}</span><span class="tl-h r">월납입액</span></div>
    ${body}
    <div class="tl-foot"><span>합계</span><span class="tl-track"><em style="left:${pc(X(today))}">오늘</em></span><span class="tl-amt">${won(total)}</span></div>
  </div>
  <p class="tl-legend"><span><i class="lg-bar"></i>내는 기간</span><span><i class="lg-recv"></i>받는 기간</span><span><i class="lg-now"></i>오늘</span>${focus.birth ? `<span>나이: ${esc(focus.name)} 기준</span>` : ''}${hidden ? `<span>예전에 다 낸 ${hidden}건은 ‘보험별 상세’에</span>` : ''}</p>
  </div>`;
}

function cardHTML(p) {
  const k = calc(p), m = member(p.who);
  const ageEnd = k.e != null ? ageAt(m, k.e) : null;
  const pl = payLabel(k);
  const period = `${k.s != null ? ymDot(k.s) : '시작 ?'} ~ ${k.e != null ? ymDot(k.e) + (ageEnd != null ? `(${ageEnd}세)` : '') : '계속'}${pl ? ` · ${pl}` : ''}`;
  const when = k.status === 'paying' ? (k.left != null ? (k.left ? `완납까지 ${dur(k.left)}` : '이번 달이 마지막') : '')
    : k.status === 'before' ? `${ymDot(k.s)} 시작` : '';

  let meter = '', foot;
  if (k.status === 'cancelled') {
    foot = `<span>해지 ${ymDot(k.c)}</span><span>${k.paidN != null ? `${won(k.paidAmt)}원 냄` : ''}</span>`;
  } else if (k.e == null) {
    foot = k.paidN != null
      ? `<span>계속 납입 · ${k.paidN}회째</span><span>지금까지 ${won(k.paidAmt)}원</span>`
      : '<span>계속 납입 · 시작 월 모름</span><span></span>';
  } else if (k.pct == null) {
    foot = k.status === 'done'
      ? '<span class="ok">✓ 납입완료</span><span></span>'
      : `<span>시작 월 모름 · 남은 ${k.remainN}회</span><span>${won(k.remainAmt)}원 남음</span>`;
  } else {
    const pct = k.pct * 100;
    meter = `<div class="meter${k.status === 'done' ? ' done' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    foot = k.status === 'done'
      ? `<span class="ok">✓ 납입완료</span><span>총 ${won(k.paidAmt)}원 냄</span>`
      : `<span>${pct.toFixed(1)}% 납부 · ${k.paidN}/${k.totalN}회</span><span>${won(k.remainAmt)}원 남음</span>`;
  }
  const ps = ym(p.payStart);
  const recv = ps != null
    ? `<div class="pol-recv">받을 돈 · ${ymDot(ps)}부터 ${p.payYears ? `${p.payYears}년간` : '평생'}${p.payAmt ? ` 월 ${won(p.payAmt)}원` : ''}${ageAt(m, ps) != null ? ` (${ageAt(m, ps)}세)` : ''}</div>` : '';
  const multi = db.members.length > 1;

  return `<article class="pol ${k.status}" data-id="${p.id}" role="button" tabindex="0" style="--c:var(--m${m.slot})">
    <div class="pol-head">
      <span class="ava" aria-hidden="true">${esc([...(p.insurer || '?')].slice(0, 2).join(''))}</span>
      <span class="pol-t"><b>${esc(p.name)}</b><small>${esc(p.insurer)} · ${esc(p.type)}${p.cover ? ` · 보장 ${esc(p.cover)}` : ''}</small>${p.product ? `<small>${esc(p.product)}</small>` : ''}</span>
      ${multi ? `<span class="who">${esc(m.name)}</span>` : ''}
    </div>
    <div class="pol-row"><span>${p.cycle === 'Y' ? '연' : '월'} 보험료</span><b>${won(p.premium)}원</b></div>
    <div class="pol-period"><span>${period}</span><span>${when}</span></div>
    ${meter}
    <div class="pol-foot">${foot}</div>
    ${recv}
    ${p.memo ? `<div class="pol-memo">${esc(p.memo)}</div>` : ''}
  </article>`;
}

/* 노트에 동그라미 치던 "언제 끝나나" → 월 보험료가 바뀌는 순간들 */
function eventsHTML(list) {
  const ev = [];
  let run = 0;
  for (const p of list) {
    const k = calc(p);
    if (k.status === 'paying') { run += k.monthly; if (k.e != null) ev.push({ at: k.e + 1, d: -k.monthly, p, what: '납입완료' }); }
    if (k.status === 'before') {
      ev.push({ at: k.s, d: k.monthly, p, what: '납입 시작' });
      if (k.e != null) ev.push({ at: k.e + 1, d: -k.monthly, p, what: '납입완료' });
    }
  }
  if (!ev.length) return '';
  ev.sort((a, b) => a.at - b.at || a.d - b.d);
  const focus = ui.who !== 'all' ? member(ui.who) : db.members[0];
  const multi = ui.who === 'all' && db.members.length > 1;
  const down = ev.every((x) => x.d < 0);
  const rows = ev.map((x) => {
    run += x.d;
    const a = ageAt(focus, x.at);
    return `<li data-id="${x.p.id}" role="button" tabindex="0">
      <span class="ev-t">${ymDot(x.at)}${a != null ? `<small>${a}세</small>` : ''}</span>
      <span class="ev-n"><b>${esc(x.p.name)}</b><small>${x.what}${multi ? ` · ${esc(member(x.p.who).name)}` : ''}</small></span>
      <span class="ev-d ${x.d < 0 ? 'down' : 'up'}">${x.d < 0 ? '−' : '+'}${won(Math.abs(x.d))}</span>
      <span class="ev-a">${won(Math.max(run, 0))}</span></li>`;
  }).join('');
  return `<div class="card">
    <h3>${down ? '보험료가 줄어드는 때' : '월 보험료가 바뀌는 때'}</h3>
    <div class="ev-h"><span>언제부터</span><span></span><span>변화</span><span>월 보험료</span></div>
    <ol class="ev">${rows}</ol></div>`;
}

function payoutsHTML(list) {
  const rows = list.filter((p) => ym(p.payStart) != null).sort((a, b) => ym(a.payStart) - ym(b.payStart));
  if (!rows.length) return '';
  return `<div class="card"><h3>받을 연금 · 만기금</h3><ol class="ev pay">${rows.map((p) => {
    const ps = ym(p.payStart), m = member(p.who), a = ageAt(m, ps);
    return `<li data-id="${p.id}" role="button" tabindex="0">
      <span class="ev-t">${ymDot(ps)}${a != null ? `<small>${a}세</small>` : ''}</span>
      <span class="ev-n"><b>${esc(p.name)}</b><small>${p.payYears ? `${p.payYears}년간` : '평생'} 받음${db.members.length > 1 ? ` · ${esc(m.name)}` : ''}</small></span>
      <span class="ev-a">${p.payAmt ? `월 ${won(p.payAmt)}` : ''}</span></li>`;
  }).join('')}</ol></div>`;
}

function emptyHTML() {
  return `<div class="card empty">
    <h2>보험을 추가해 보세요</h2>
    <p>월 납입액과 납입기간만 넣으면 매달 얼마가 나가는지, 언제 다 내는지 한눈에 보여 드려요. 보험증권·보험 앱 캡처·손으로 적은 표 사진을 올리면 AI가 읽어서 채워 줘요.</p>
    <button class="btn primary wide" data-act="scan">📷 사진으로 등록</button>
    <button class="btn wide" data-act="add">＋ 직접 입력</button>
    <button class="btn wide" data-act="sample">예시 데이터로 둘러보기</button>
    <div class="howto"><b>가입한 보험이 기억 안 나면?</b>
      <p><a href="https://www.credit4u.or.kr" target="_blank" rel="noopener">내보험다보여(신용정보원) ↗</a>에서 본인 명의 보험을 한 번에 조회할 수 있어요.</p></div>
  </div>`;
}

/* ── 보험 추가 / 수정 ── */
let editing = null;
const dlgP = $('#dlgPolicy');

function whoPicker(sel) {
  $('#p-who').innerHTML = db.members.map((m) =>
    `<label class="chip" style="--c:var(--m${m.slot})"><input type="radio" name="who" value="${m.id}"${m.id === sel ? ' checked' : ''}><i></i>${esc(m.name)}</label>`).join('')
    + '<button type="button" class="chip add" data-act="addMember">＋ 가족</button>';
}

function openPolicy(id) {
  editing = id ? db.policies.find((p) => p.id === id) : null;
  const p = editing || { who: ui.who !== 'all' ? ui.who : db.members[0].id, cycle: 'M', type: '건강' };
  $('#pTitle').textContent = editing ? '보험 수정' : '보험 추가';
  whoPicker(p.who);
  const set = (f, v) => { $(`#p-${f}`).value = v ?? ''; };
  set('insurer', p.insurer); set('type', p.type); set('name', p.name); set('product', p.product);
  set('premium', p.premium ? won(p.premium) : ''); set('cycle', p.cycle);
  set('start', p.start); set('end', p.end); set('years', '');
  set('cover', p.cover); set('payday', p.payday); set('payStart', p.payStart); set('payYears', p.payYears);
  set('payAmt', p.payAmt ? won(p.payAmt) : ''); set('cancel', p.cancel); set('memo', p.memo);
  $('#p-open').checked = !!editing && !p.end;
  $('#h-pct').value = ''; $('#h-remain').value = ''; $('#h-out').textContent = '';
  $('#p-helper').open = false;
  $('#p-more').open = !!(p.cover || p.payday || p.payStart || p.cancel || p.memo);
  $('#pDel').hidden = !editing;
  $('#pScan').hidden = !!editing;
  $('#p-err').textContent = '';
  fromEnd(); syncOpen(); premiumHint();
  dlgP.showModal();
}

function fromYears() {
  const s = ym($('#p-start').value), y = parseFloat($('#p-years').value);
  if (s != null && y > 0) { $('#p-end').value = ymStr(s + Math.round(y * 12) - 1); $('#p-open').checked = false; syncOpen(); }
}
function fromEnd() {
  const s = ym($('#p-start').value), e = ym($('#p-end').value);
  $('#p-years').value = s != null && e != null && e >= s ? +((e - s + 1) / 12).toFixed(2) : '';
}
function syncOpen() {
  const on = $('#p-open').checked;
  $('#p-years').disabled = on; $('#p-end').disabled = on;
  $$('.quick button').forEach((b) => { b.disabled = on; });
}
function premiumHint() {
  const n = digits($('#p-premium').value);
  $('#p-premium-hint').textContent = n >= 10000 ? manwon(n) : '';
}

/** 납부율과 남은 횟수 → 전체 횟수. 계약은 보통 1년 단위라 월납에서 ±1회 차이는 맞춰 준다 (61회 → 60회) */
function totalFrom(left, pct, per) {
  let total = Math.round(left / (1 - pct / 100));
  const snap = Math.round(total / 12) * 12;
  if (per === 1 && snap >= 12 && Math.abs(snap - total) <= 1) total = snap;
  return Math.max(total, left);
}

/* 보험 앱의 "34.4% 납부 · 17,593,480원 남음" → 납입 시작/끝 */
function calcRemain() {
  const prem = digits($('#p-premium').value), remain = digits($('#h-remain').value);
  const pct = parseFloat(String($('#h-pct').value).replace(/[^\d.]/g, ''));
  const out = $('#h-out');
  if (!prem) { out.textContent = '납입액을 먼저 넣어 주세요.'; return; }
  if (!remain) { out.textContent = '남은 금액을 넣어 주세요.'; return; }
  const per = $('#p-cycle').value === 'Y' ? 12 : 1;
  const left = Math.round(remain / prem); // 남은 횟수
  const end = NOW + left * per;
  $('#p-end').value = ymStr(end);
  $('#p-open').checked = false; syncOpen();
  if (pct > 0 && pct < 100) {
    const total = totalFrom(left, pct, per);
    const paid = total - left;
    const start = NOW - (paid - 1) * per;
    $('#p-start').value = ymStr(start);
    out.textContent = `→ ${ymDot(start)} ~ ${ymDot(end)} · 총 ${total}회 중 ${paid}회 냄. 보험증권과 다르면 고쳐 주세요.`;
  } else {
    out.textContent = `→ 납입 끝 ${ymDot(end)} (남은 ${left}회). 납입 시작 월은 직접 넣어 주세요.`;
  }
  fromEnd();
}

/** 저장 전에 빠진 값 확인. 시작 월은 몰라도 되지만, 끝 월(또는 갱신형)은 있어야 한다 */
function policyError(p, open) {
  return !p.insurer ? '보험사를 넣어 주세요.'
    : !p.premium ? '납입액을 넣어 주세요.'
    : !open && !p.end ? '납입 끝 월(또는 시작 월 + 기간)을 넣거나, 갱신형이면 체크해 주세요.'
    : p.start && p.end && ym(p.end) < ym(p.start) ? '납입 끝이 시작보다 빨라요.'
    : '';
}

$('#fPolicy').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (f) => $(`#p-${f}`).value.trim();
  const open = $('#p-open').checked;
  const p = {
    id: editing ? editing.id : uid(),
    who: ($('input[name=who]:checked') || {}).value || db.members[0].id,
    insurer: v('insurer'), name: v('name'), product: v('product'), type: v('type'),
    premium: digits(v('premium')), cycle: v('cycle'),
    start: ymStr(ym(v('start'))), end: open ? '' : ymStr(ym(v('end'))),
    cover: v('cover'), payday: Math.min(31, +v('payday')) || null,
    payStart: ymStr(ym(v('payStart'))), payYears: +v('payYears') || null, payAmt: digits(v('payAmt')) || null,
    cancel: ymStr(ym(v('cancel'))), memo: v('memo'),
  };
  if (!p.name && p.insurer) p.name = `${p.insurer.replace(/(생명|화재|손해보험|라이프)$/, '')} ${p.type}`.trim();
  const err = policyError(p, open);
  if (err) { $('#p-err').textContent = err; return; }
  if (editing) Object.assign(editing, p); else db.policies.push(p);
  save(); dlgP.close(); render(); persist();
});

/* ── 가족 ── */
let editingM = null;
const dlgM = $('#dlgMember');

function openMember(id) {
  editingM = id ? db.members.find((m) => m.id === id) : null;
  if (!editingM && db.members.length >= SLOTS) { alert(`가족은 ${SLOTS}명까지 넣을 수 있어요.`); return; }
  $('#mTitle').textContent = editingM ? '가족 수정' : '가족 추가';
  $('#m-name').value = editingM ? editingM.name : '';
  $('#m-birth').value = editingM && editingM.birth ? editingM.birth : '';
  $('#m-err').textContent = '';
  $('#mDel').hidden = !editingM || db.members.length === 1;
  dlgM.showModal();
}

$('#fMember').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#m-name').value.trim();
  const b = digits($('#m-birth').value);
  const thisYear = new Date().getFullYear();
  if (!name) { $('#m-err').textContent = '이름을 넣어 주세요.'; return; }
  if (b && (b < 1900 || b > thisYear)) { $('#m-err').textContent = '출생 연도는 4자리로 넣어 주세요. 예: 1982'; return; }
  let id;
  if (editingM) { editingM.name = name; editingM.birth = b || null; id = editingM.id; }
  else { id = uid(); db.members.push({ id, name, birth: b || null, slot: nextSlot() }); }
  save(); dlgM.close();
  if (dlgP.open) { const cur = ($('input[name=who]:checked') || {}).value; whoPicker(editingM ? cur : id); }
  if ($('#dlgSettings').open) renderMembers();
  render();
});

function deleteMember() {
  const m = editingM;
  if (!m || db.members.length === 1) return;
  const n = db.policies.filter((p) => p.who === m.id).length;
  if (!confirm(n ? `${m.name}의 보험 ${n}건도 같이 지워져요. 지울까요?` : `${m.name}을(를) 지울까요?`)) return;
  db.members = db.members.filter((x) => x !== m);
  db.policies = db.policies.filter((p) => p.who !== m.id);
  save(); dlgM.close();
  if ($('#dlgSettings').open) renderMembers();
  render();
}

function renderMembers() {
  $('#memberList').innerHTML = db.members.map((m) => {
    const n = db.policies.filter((p) => p.who === m.id).length;
    return `<button class="mrow" data-member="${m.id}" style="--c:var(--m${m.slot})"><i></i><b>${esc(m.name)}</b><small>${m.birth ? `${m.birth}년생` : '출생 연도 없음'}</small><span>보험 ${n}건 ›</span></button>`;
  }).join('');
}

/* ── 백업 / 엑셀 ── */
const CSV_COLS = [
  ['who', '피보험자'], ['insurer', '보험사'], ['name', '보험이름'], ['product', '상품명'], ['type', '종류'],
  ['premium', '납입액'], ['cycle', '납입주기'], ['start', '납입시작'], ['end', '납입끝'], ['years', '납입기간(년)'],
  ['cover', '보장만기'], ['payday', '이체일'], ['payStart', '연금시작'], ['payYears', '연금기간(년)'], ['payAmt', '월수령액'],
  ['cancel', '해지월'], ['memo', '메모'],
];
const csvCell = (v) => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const csvLine = (arr) => arr.map(csvCell).join(',');

function toCSV(policies) {
  const lines = [csvLine(CSV_COLS.map((c) => c[1]))];
  for (const p of policies) {
    const k = compute(p);
    lines.push(csvLine(CSV_COLS.map(([key]) => {
      if (key === 'who') return member(p.who).name;
      if (key === 'cycle') return p.cycle === 'Y' ? '연납' : '월납';
      if (key === 'years') return p.end && k.s != null ? +((k.e - k.s + 1) / 12).toFixed(2) : '';
      return p[key] ?? '';
    })));
  }
  return '﻿' + lines.join('\r\n'); // BOM: 엑셀에서 한글 안 깨지게
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) { alert('엑셀 파일에 내용이 없어요.'); return; }
  const norm = (h) => h.replace(/\s|\(.*?\)/g, '');
  const idx = {};
  rows[0].forEach((h, i) => { const c = CSV_COLS.find(([k, label]) => norm(label) === norm(h) || k === h.trim()); if (c) idx[c[0]] = i; });
  if (idx.insurer == null || idx.premium == null) { alert('첫 줄에 최소한 ‘보험사, 납입액’ 칸이 있어야 해요. ‘엑셀 입력 양식’을 받아서 써 보세요.'); return; }
  let added = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (k) => (idx[k] != null ? String(r[idx[k]] ?? '').trim() : '');
    const s = ym(get('start')), prem = digits(get('premium'));
    if (!prem || !get('insurer')) { skipped++; continue; }
    let e = ym(get('end'));
    const yrs = parseFloat(get('years'));
    if (e == null && yrs > 0 && s != null) e = s + Math.round(yrs * 12) - 1;
    const whoName = get('who');
    let m = whoName ? db.members.find((x) => x.name === whoName) : db.members[0];
    if (!m) {
      if (db.members.length >= SLOTS) m = db.members[0];
      else { m = { id: uid(), name: whoName.slice(0, 12), birth: null, slot: nextSlot() }; db.members.push(m); }
    }
    const type = TYPES.includes(get('type')) ? get('type') : (get('type') || '기타');
    db.policies.push({
      id: uid(), who: m.id, insurer: get('insurer'), name: get('name') || `${get('insurer')} ${type}`, product: get('product'), type,
      premium: prem, cycle: /연/.test(get('cycle')) ? 'Y' : 'M', start: ymStr(s), end: ymStr(e),
      cover: get('cover'), payday: digits(get('payday')) || null, payStart: ymStr(ym(get('payStart'))),
      payYears: parseFloat(get('payYears')) || null, payAmt: digits(get('payAmt')) || null,
      cancel: ymStr(ym(get('cancel'))), memo: get('memo'),
    });
    added++;
  }
  save(); render(); if ($('#dlgSettings').open) renderMembers();
  alert(`${added}건을 추가했어요.${skipped ? ` (보험사나 납입액이 없는 ${skipped}줄은 건너뜀)` : ''}`);
}

function importJSON(text) {
  let d;
  try { d = JSON.parse(text); } catch { alert('백업 파일을 읽지 못했어요.'); return; }
  if (!d || !Array.isArray(d.members) || !Array.isArray(d.policies)) { alert('이 앱의 백업 파일이 아니에요.'); return; }
  if (db.policies.length && !confirm(`지금 데이터(보험 ${db.policies.length}건)를 백업 파일 내용(보험 ${d.policies.length}건)으로 바꿀까요?`)) return;
  db = normalize(d); ui.who = 'all';
  save(); saveUI(); render(); if ($('#dlgSettings').open) renderMembers(); persist();
}

async function readFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('euc-kr').decode(buf); } // 한글 엑셀의 기본 CSV 저장 형식
}

async function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };

/* ── 예시 데이터 (가상) ── */
function sample() {
  const me = { id: uid(), name: '본인', birth: 1982, slot: 0 };
  const sp = { id: uid(), name: '배우자', birth: 1985, slot: 1 };
  const kid = { id: uid(), name: '첫째', birth: 2016, slot: 2 };
  const P = (who, insurer, name, type, premium, start, end, extra = {}) => ({ id: uid(), who: who.id, insurer, name, product: '', type, premium, cycle: 'M', start, end, cover: '', payday: null, payStart: '', payYears: null, payAmt: null, cancel: '', memo: '', ...extra });
  return {
    members: [me, sp, kid],
    policies: [
      P(me, '한화생명', '한화 연금', '연금', 200000, '2014-03', '2034-02', { payStart: '2042-01', payAmt: 500000, memo: '평생 받는 연금' }),
      P(me, '교보생명', '교보 변액연금', '연금', 100000, '2016-09', '2028-09', { payStart: '2047-01', payYears: 10, payAmt: 300000 }),
      P(me, '메리츠화재', '메리츠 암보험', '암', 35000, '2013-05', '2033-04', { cover: '100세' }),
      P(me, '동양생명', '동양 종신', '종신', 29700, '2007-08', '2027-07', { cover: '종신', memo: '자동이체 할인 -300원' }),
      P(me, '현대해상', '현대 실손', '실손', 38500, '2017-04', ''),
      P(me, 'DB손해보험', 'DB 운전자', '운전자', 12800, '2021-02', '2041-01'),
      P(me, 'NH농협생명', '농협 정기', '정기', 45000, '2009-01', '2018-12'),
      P(me, '삼성생명', '삼성 저축', '저축', 150000, '2015-01', '2025-12', { cancel: '2020-02' }),
      P(sp, '삼성화재', '삼성 건강', '건강', 68800, '2015-06', '2035-05', { cover: '100세' }),
      P(sp, 'KB손해보험', 'KB 실손', '실손', 24300, '2019-10', ''),
      P(sp, '롯데손해보험', '롯데 간병', '간병', 50000, '2023-01', '2032-12'),
      P(kid, '현대해상', '현대 어린이', '어린이', 57650, '2016-05', '2046-04', { cover: '100세', memo: '카드 5% 할인' }),
      P(kid, '흥국화재', '흥국 치아', '치아', 18900, '2024-03', '2034-02'),
    ],
  };
}

/* ── 사진으로 등록 (Claude API) ──
 * 사진을 Claude가 읽어 보험 목록(JSON)으로 돌려주면, 확인 화면에서 고친 뒤 등록한다.
 * API 키는 이 기기에만 저장하고 백업 파일에는 넣지 않는다. */
const API_KEY = 'insure.apiKey';
const MODEL = 'claude-opus-5-5';
const MAX_PHOTOS = 5;
const getKey = () => { try { return localStorage.getItem(API_KEY) || ''; } catch { return ''; } };
const setKey = (k) => { try { if (k) localStorage.setItem(API_KEY, k); else localStorage.removeItem(API_KEY); } catch {} };

let Anthropic = null; // SDK는 처음 스캔할 때만 불러온다 (약 300KB)
async function sdk() {
  if (!Anthropic) Anthropic = (await import('./vendor/anthropic-sdk-1.1.0.mjs')).default;
  return Anthropic;
}

const SCAN_SYSTEM = `너는 한국 가정의 보험 관리 앱에 넣을 데이터를 사진에서 뽑는 도우미야.
사진은 보험증권, 보험사·토스·뱅크샐러드 같은 앱 화면 캡처, 손으로 적은 보험 표일 수 있어.
사진에 보이는 서로 다른 보험 계약을 하나도 빠짐없이 policies 배열에 넣어. 보험이 없으면 빈 배열.

규칙
- 보이지 않는 값은 지어내지 말고 빈 문자열("") 또는 0으로 둬.
- premium: 한 번 낼 때 금액(원, 정수). 월납이면 월 보험료. 고친 흔적이 있으면 가장 최근 금액을 쓰고 예전 금액은 memo에.
- cycle: 월납 "M", 연납 "Y".
- start / end: "YYYY-MM". 연도만 알면 "YYYY". end는 보험료를 마지막으로 내는 달(납입 만료)이야. 보장 만기와 헷갈리지 마.
- years: "20년납"처럼 납입 기간이 보이면 그 연수.
- 손으로 그린 표에서 선이 어느 연도 칸에서 끝나면 그 연도가 end야. 연도 위에 나이가 같이 적혀 있어도 end는 연도로.
- renewable: 실손의료비처럼 갱신형이거나 납입 끝이 정해지지 않은 보험이면 true.
- paidPct / remainAmount: 화면에 "34.4% 납부", "17,593,480원 남음"처럼 보이면 그 숫자 그대로.
- cancelled: 줄을 그어 지웠거나 해지·실효로 적힌 보험. 해지 시점이 보이면 cancelMonth("YYYY-MM").
- payStart / payYears / payAmt: 연금·만기금을 받는 정보. 예: "2036년부터 5년간 지급" → payStart "2036", payYears 5. 종신 지급이면 payYears 0.
- insured: 피보험자(보장받는 사람)의 이름이나 관계가 보이면.
- name: 목록에 보일 짧은 이름, 12자 이내. 예: "교보 변액연금", "현대 실손".
- insurer: 보이는 회사 이름 그대로. 옛 이름(LIG, 동부 등)이면 memo에 지금 이름을 적어도 돼.
- unsure: 글씨가 흐리거나 숫자를 확실히 못 읽었으면 true.
- note: 사용자에게 알려 줄 점을 한두 문장으로.
- 아이디, 비밀번호, 주민등록번호, 계좌·카드 번호 같은 민감한 정보는 어디에도 옮기지 마.`;

const S = (type, extra = {}) => ({ type, ...extra });
const SCAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['policies', 'note'],
  properties: {
    note: S('string'),
    policies: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['insured', 'insurer', 'name', 'product', 'type', 'premium', 'cycle', 'start', 'end', 'years', 'renewable',
          'paidPct', 'remainAmount', 'cover', 'payStart', 'payYears', 'payAmt', 'cancelled', 'cancelMonth', 'unsure', 'memo'],
        properties: {
          insured: S('string'), insurer: S('string'), name: S('string'), product: S('string'),
          type: S('string', { enum: TYPES }), premium: S('integer'), cycle: S('string', { enum: ['M', 'Y'] }),
          start: S('string'), end: S('string'), years: S('number'), renewable: S('boolean'),
          paidPct: S('number'), remainAmount: S('integer'), cover: S('string'),
          payStart: S('string'), payYears: S('integer'), payAmt: S('integer'),
          cancelled: S('boolean'), cancelMonth: S('string'), unsure: S('boolean'), memo: S('string'),
        },
      },
    },
  },
};

const dlgS = $('#dlgScan');
let scanRows = [], scanNote = '', scanAbort = null;
function scanStep(name) { $$('#dlgScan [data-step]').forEach((el) => { el.hidden = el.dataset.step !== name; }); if (!dlgS.open) dlgS.showModal(); }

function openScan() {
  if (dlgP.open) dlgP.close();
  if (!getKey()) { $('#s-key').value = ''; $('#s-key-err').textContent = ''; scanStep('key'); return; }
  $('#scanFile').click();
}

function saveKey() {
  const k = $('#s-key').value.trim();
  if (!/^sk-ant-/.test(k)) { $('#s-key-err').textContent = 'sk-ant- 로 시작하는 키를 붙여넣어 주세요.'; return; }
  setKey(k);
  if ($('#dlgSettings').open) renderKeyState();
  $('#scanFile').click(); // 사용자가 누른 버튼 안에서 바로 사진 고르기
}

/** 큰 폰 사진을 Claude가 읽는 최대 크기(긴 변 2576px, 3.75MP)로 줄여 JPEG로 */
async function prepImage(file) {
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('사진을 열 수 없어요.')); img.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height;
  const sc = Math.min(1, 2576 / Math.max(w, h), Math.sqrt(3.75e6 / (w * h)));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL('image/jpeg', 0.88);
  return { url, data: url.slice(url.indexOf(',') + 1) };
}

async function runScan(files) {
  files = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)).slice(0, MAX_PHOTOS);
  if (!files.length) return;
  scanStep('busy');
  $('#s-thumbs').innerHTML = '';
  $('#s-busy-msg').textContent = '사진 준비 중…';
  const ac = new AbortController();
  scanAbort = ac;
  try {
    const imgs = [];
    for (const f of files) {
      const im = await prepImage(f);
      imgs.push(im);
      $('#s-thumbs').insertAdjacentHTML('beforeend', `<img src="${im.url}" alt="">`);
    }
    if (ac.signal.aborted) return;
    $('#s-busy-msg').textContent = 'AI가 사진을 읽는 중… 보통 20초~1분 걸려요.';
    const A = await sdk();
    const client = new A({ apiKey: getKey(), dangerouslyAllowBrowser: true, maxRetries: 1 });
    const d = new Date();
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // 드물게 안전 필터가 거절하면 다른 모델로 자동 재시도
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCAN_SCHEMA } },
      system: SCAN_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          ...imgs.map((im) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.data } })),
          { type: 'text', text: `오늘은 ${d.getFullYear()}년 ${d.getMonth() + 1}월이야. 이 사진${imgs.length > 1 ? '들' : ''}에서 보험을 모두 찾아 줘.` },
        ],
      }],
    }, { signal: ac.signal });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('이 사진은 읽을 수 없다는 답이 왔어요. 다른 사진으로 해 보세요.');
    if (msg.stop_reason === 'max_tokens') throw new Error('사진 속 내용이 너무 많아요. 사진을 나눠서 올려 주세요.');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try { out = JSON.parse(text); } catch { throw new Error('결과를 읽지 못했어요. 다시 해 보세요.'); }
    scanNote = String(out.note || '');
    scanRows = (Array.isArray(out.policies) ? out.policies : []).map(fromScan);
    renderScanRows();
    scanStep('review');
  } catch (err) {
    if (ac.signal.aborted) return;
    showScanError(err);
  } finally {
    if (scanAbort === ac) scanAbort = null;
  }
}

function showScanError(err) {
  const A = Anthropic;
  let msg = (err && err.message) || '알 수 없는 오류가 났어요.', key = false;
  if (A) {
    if (err instanceof A.AuthenticationError) { msg = 'API 키가 맞지 않아요. 키를 다시 넣어 주세요.'; key = true; }
    else if (err instanceof A.PermissionDeniedError) { msg = '이 API 키로는 쓸 수 없어요. 콘솔에서 키 권한을 확인해 주세요.'; key = true; }
    else if (err instanceof A.RateLimitError) msg = '요청이 너무 많아요. 1분쯤 뒤에 다시 해 보세요.';
    else if (err instanceof A.BadRequestError) msg = `요청이 거절됐어요. 크레딧 잔액이 부족하면 콘솔에서 충전해야 해요.\n(${err.message})`;
    else if (err instanceof A.APIConnectionError) msg = '인터넷 연결을 확인하고 다시 해 보세요.';
    else if (err instanceof A.APIError) msg = `AI 서버 오류(${err.status ?? '?'})예요. 잠시 뒤 다시 해 보세요.`;
  }
  $('#s-error-msg').textContent = msg;
  $('#s-error-key').hidden = !key;
  scanStep('error');
}

const yearOnly = (v) => /^\s*\d{4}\s*$/.test(v || '');
const normName = (s) => String(s || '').replace(/\s|(생명|화재|손해보험|손보|라이프|보험)$/g, '');

/** AI가 읽은 한 줄 → 확인 화면용 데이터 (빈 값 채우기 + 확인할 점 표시) */
function fromScan(r) {
  const per = r.cycle === 'Y' ? 12 : 1;
  const premium = Math.max(0, Math.round(+r.premium || 0));
  let open = !!r.renewable;
  let s = ym(r.start);
  let e = open ? null : yearOnly(r.end) ? +r.end.trim() * 12 + 11 : ym(r.end);
  const warn = [];
  if (!open) {
    if (e == null && s != null && r.years > 0) e = s + Math.round(r.years * 12) - 1;
    if (r.remainAmount > 0 && premium > 0) {
      const left = Math.round(r.remainAmount / premium);
      if (e == null) e = NOW + left * per;
      if (s == null && r.paidPct > 0 && r.paidPct < 100) {
        const total = totalFrom(left, r.paidPct, per);
        s = NOW - (total - left - 1) * per;
      }
    }
    if (e != null && e - NOW > 80 * 12) { e = null; open = true; warn.push('끝이 너무 멀어서 갱신형으로 넣었어요'); }
  }
  if (yearOnly(r.start) || (!open && yearOnly(r.end))) warn.push('월은 몰라서 추정했어요');
  if (r.unsure) warn.push('글씨가 흐려서 금액·연도를 꼭 확인해 주세요');

  const insured = String(r.insured || '').trim();
  const hit = insured && db.members.find((m) => m.name === insured || insured.includes(m.name) || m.name.includes(insured));
  if (insured && !hit) warn.push(`사진 속 피보험자: ${insured}`);
  const dup = db.policies.some((p) => p.premium === premium && normName(p.insurer) === normName(r.insurer));
  if (dup) warn.push('이미 등록된 보험 같아요');
  if (r.cancelled) warn.push('해지한 보험으로 보여요. 등록하면 ‘해지한 보험’에 들어가요');

  return {
    on: !dup && !r.cancelled,
    who: hit ? hit.id : ui.who !== 'all' ? ui.who : db.members[0].id,
    insurer: String(r.insurer || '').trim(), name: String(r.name || '').trim().slice(0, 20), product: String(r.product || '').trim(),
    type: TYPES.includes(r.type) ? r.type : '기타', premium, cycle: r.cycle === 'Y' ? 'Y' : 'M',
    start: ymStr(s), end: ymStr(e), open,
    cover: String(r.cover || ''), payStart: ymStr(yearOnly(r.payStart) ? +r.payStart.trim() * 12 : ym(r.payStart)),
    payYears: +r.payYears || null, payAmt: +r.payAmt || null,
    cancel: r.cancelled ? (ymStr(ym(r.cancelMonth)) || ymStr(NOW)) : '',
    memo: String(r.memo || '').trim(), warn, err: '',
  };
}

function renderScanRows() {
  const n = scanRows.length;
  $('#s-title').textContent = n ? `찾은 보험 ${n}건` : '보험을 찾지 못했어요';
  $('#s-note').textContent = scanNote;
  $('#s-err').textContent = '';
  $('#s-rows').innerHTML = scanRows.map((r, i) => `
    <div class="srow${r.on ? '' : ' off'}${r.err ? ' bad' : ''}" data-i="${i}">
      <div class="srow-top">
        <label class="srow-on"><input type="checkbox" data-f="on"${r.on ? ' checked' : ''}><b>${esc(r.name || r.insurer || '이름 없음')}</b></label>
        <select data-f="who" aria-label="누구 보험">${db.members.map((m) => `<option value="${m.id}"${m.id === r.who ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      <div class="grid2">
        <label>보험사<input data-f="insurer" value="${esc(r.insurer)}" list="insurerList"></label>
        <label>이름<input data-f="name" value="${esc(r.name)}" maxlength="20"></label>
      </div>
      <div class="grid2">
        <label>${r.cycle === 'Y' ? '연' : '월'} 납입액<input class="money" data-f="premium" inputmode="numeric" value="${r.premium ? won(r.premium) : ''}"></label>
        <label>종류<select data-f="type">${TYPES.map((t) => `<option${t === r.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div class="grid2">
        <label>납입 시작 <small>모르면 비움</small><input type="month" data-f="start" value="${r.start}"></label>
        <label>납입 끝<input type="month" data-f="end" value="${r.end}"${r.open ? ' disabled' : ''}></label>
      </div>
      <label class="check sm"><input type="checkbox" data-f="open"${r.open ? ' checked' : ''}><span>갱신형 · 끝 없음</span></label>
      ${r.product ? `<p class="srow-sub">${esc(r.product)}</p>` : ''}
      ${r.memo ? `<p class="srow-sub">메모: ${esc(r.memo)}</p>` : ''}
      ${r.warn.map((w) => `<p class="srow-warn">⚠ ${esc(w)}</p>`).join('')}
      ${r.err ? `<p class="err">${esc(r.err)}</p>` : ''}
    </div>`).join('');
  updateScanCount();
}
function updateScanCount() {
  const n = scanRows.filter((r) => r.on).length;
  const b = $('#s-save');
  b.textContent = n ? `${n}건 등록` : '등록할 보험 없음';
  b.disabled = !n;
}

function saveScan() {
  let bad = 0;
  for (const r of scanRows) {
    r.err = r.on ? policyError(r, r.open) : '';
    if (r.err) bad++;
  }
  if (bad) { renderScanRows(); $('#s-err').textContent = `${bad}건에 빠진 값이 있어요. 빨간 글씨를 확인해 주세요.`; return; }
  const add = scanRows.filter((r) => r.on).map((r) => ({
    id: uid(), who: r.who, insurer: r.insurer, product: r.product, type: r.type,
    name: r.name || `${r.insurer.replace(/(생명|화재|손해보험|라이프)$/, '')} ${r.type}`.trim(),
    premium: r.premium, cycle: r.cycle, start: r.start, end: r.open ? '' : r.end,
    cover: r.cover, payday: null, payStart: r.payStart, payYears: r.payYears, payAmt: r.payAmt,
    cancel: r.cancel, memo: r.memo,
  }));
  db.policies.push(...add);
  save(); dlgS.close(); render(); persist();
  toast(`${add.length}건을 등록했어요. 틀린 곳은 눌러서 고치세요.`);
}

$('#s-rows').addEventListener('input', (e) => {
  const el = e.target, row = el.closest('[data-i]');
  if (!row || !el.dataset.f) return;
  const r = scanRows[+row.dataset.i], f = el.dataset.f;
  if (el.classList.contains('money')) { const n = digits(el.value); el.value = n ? won(n) : ''; r[f] = n; return; }
  if (el.type === 'checkbox') {
    r[f] = el.checked;
    if (f === 'on') { row.classList.toggle('off', !el.checked); updateScanCount(); }
    if (f === 'open') $('[data-f=end]', row).disabled = el.checked;
    return;
  }
  r[f] = f === 'start' || f === 'end' ? ymStr(ym(el.value)) : el.value.trim();
  if (f === 'name' || f === 'insurer') $('.srow-on b', row).textContent = r.name || r.insurer || '이름 없음';
});
$('#s-rows').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
$('#scanFile').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; runScan(fs); });
dlgS.addEventListener('close', () => { if (scanAbort) scanAbort.abort(); });

function renderKeyState() {
  const k = getKey();
  $('#keyState').textContent = k ? `연결됨 · ${k.slice(0, 10)}…${k.slice(-4)}` : '아직 API 키가 없어요';
  $('#btnKeyDel').hidden = !k;
}

let toastT;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ── 버튼들 ── */
const actions = {
  add: () => openPolicy(null),
  settings: () => { renderMembers(); renderKeyState(); $('#dlgSettings').showModal(); },
  scan: openScan,
  saveKey,
  saveScan,
  scanMore: () => $('#scanFile').click(),
  cancelScan: () => { if (scanAbort) scanAbort.abort(); dlgS.close(); },
  editKey: () => { $('#s-key').value = ''; $('#s-key-err').textContent = ''; scanStep('key'); },
  delKey: () => { if (confirm('이 폰에 저장된 API 키를 지울까요?')) { setKey(''); renderKeyState(); } },
  addMember: () => openMember(null),
  deleteMember,
  deletePolicy: () => {
    if (!editing || !confirm(`‘${editing.name}’을(를) 지울까요?`)) return;
    db.policies = db.policies.filter((p) => p !== editing);
    save(); dlgP.close(); render();
  },
  calcRemain,
  exportJson: () => saveFile(`보험백업_${stamp()}.json`, JSON.stringify({ app: 'insure', version: 1, exported: new Date().toISOString(), ...db }, null, 1), 'application/json'),
  exportCsv: () => saveFile(`보험목록_${stamp()}.csv`, toCSV(db.policies), 'text/csv'),
  csvTemplate: () => saveFile('보험_입력양식.csv', '﻿' + [
    csvLine(CSV_COLS.map((c) => c[1])),
    csvLine(['본인', '교보생명', '교보 변액연금', '', '연금', '100000', '월납', '2016-09', '', '12', '', '25', '2047-01', '10', '300000', '', '']),
    csvLine(['아내', '현대해상', '현대 실손', '', '실손', '38500', '월납', '2017-04', '', '', '', '', '', '', '', '', '갱신형은 납입끝·기간을 비워 두세요']),
  ].join('\r\n'), 'text/csv'),
  import: () => $('#fileIn').click(),
  sample: () => {
    if (db.policies.length && !confirm('지금 데이터를 지우고 예시 데이터를 넣을까요?\n(필요하면 먼저 ‘백업 파일 저장’을 하세요)')) return;
    db = sample(); ui.who = 'all'; save(); saveUI(); render();
    if ($('#dlgSettings').open) $('#dlgSettings').close();
  },
  wipe: () => {
    if (!confirm('보험과 가족 정보를 모두 지울까요? 되돌릴 수 없어요.')) return;
    db = blank(); ui.who = 'all'; save(); saveUI(); render(); $('#dlgSettings').close();
  },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-who],[data-view],[data-id],[data-member],[data-close],[data-years]');
  if (!t) return;
  if (t.hasAttribute('data-close')) { t.closest('dialog').close(); return; }
  if (t.dataset.who) { ui.who = t.dataset.who; saveUI(); render(); return; }
  if (t.dataset.view) { ui.view = t.dataset.view; saveUI(); render(); return; }
  if (t.dataset.years) { $('#p-years').value = t.dataset.years; fromYears(); return; }
  if (t.dataset.member) { openMember(t.dataset.member); return; }
  if (t.dataset.act) { actions[t.dataset.act](t); return; }
  if (t.dataset.id) openPolicy(t.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-id]')) { e.preventDefault(); e.target.click(); }
});
// 시트 바깥(어두운 부분)을 누르면 닫기
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

$$('input.money').forEach((el) => el.addEventListener('input', () => {
  const n = digits(el.value); el.value = n ? won(n) : '';
  if (el.id === 'p-premium') premiumHint();
}));
$('#p-years').addEventListener('input', fromYears);
$('#p-end').addEventListener('change', fromEnd);
$('#p-start').addEventListener('change', () => { if (parseFloat($('#p-years').value) > 0) fromYears(); else fromEnd(); });
$('#p-open').addEventListener('change', syncOpen);
$('#fileIn').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const text = await readFile(f);
  if (/\.json$/i.test(f.name) || text.trim().startsWith('{')) importJSON(text); else importCSV(text);
});

$('#p-type').innerHTML = TYPES.map((t) => `<option>${t}</option>`).join('');
$('#insurerList').innerHTML = INSURERS.map((n) => `<option value="${n}">`).join('');

// 화면 폭이 바뀌면(가로 회전 등) 타임라인 눈금을 다시 계산
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.view === 'timeline') render(); }, 150); });

// 달이 바뀌면 다시 계산
document.addEventListener('visibilitychange', () => { if (!document.hidden && nowIdx() !== NOW) render(); });

// 브라우저가 저장 공간을 정리할 때 지우지 않도록 요청
function persist() { if (db.policies.length && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); }

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
