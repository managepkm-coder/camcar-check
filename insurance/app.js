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
  const policies = (Array.isArray(d.policies) ? d.policies : []).filter((p) => p && ym(p.start) != null).map((p) => ({
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
  else if (NOW < s) status = 'before';
  else if (e != null && NOW > e) status = 'done';

  const totalN = e != null ? Math.max(0, Math.floor((e - s) / per) + 1) : Infinity;
  const paidN = Math.max(0, Math.min(totalN, Math.floor((Math.min(NOW, e ?? NOW) - s) / per) + 1));
  const remainN = status === 'cancelled' ? 0 : totalN - paidN;
  return {
    s, e, c, per, status, totalN, paidN, remainN,
    monthly: p.premium / per, // 연납은 월로 환산
    paidAmt: paidN * p.premium,
    remainAmt: Number.isFinite(remainN) ? remainN * p.premium : null,
    pct: Number.isFinite(totalN) && totalN > 0 ? paidN / totalN : null,
    left: e != null ? Math.max(0, e - NOW) : null, // 이번 달 다음부터 남은 개월
  };
}
const payLabel = (k) => {
  if (k.e == null) return '갱신형';
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
  let monthly = 0, paid = 0, remain = 0, nPay = 0, nDone = 0, nOpen = 0;
  for (const p of list) {
    const k = calc(p);
    paid += k.paidAmt;
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
      <div><small>지금까지 낸 돈</small><b>${manwon(paid)}</b></div>
      <div><small>앞으로 낼 돈</small><b>${manwon(remain)}</b>${nOpen ? `<em>갱신형 ${nOpen}건 빼고</em>` : ''}</div>
    </div>
  </div>`;
}

/* 손으로 그리던 표 그대로: 왼쪽 보험 이름, 가운데 납입기간 막대, 오른쪽 월납입액, 맨 아래 합계 */
function timelineHTML(list) {
  let rows = list.map((p) => ({ p, k: calc(p), m: member(p.who) }));
  // 지난 일은 최근 4년만 보여 주고, 화면 폭은 앞으로 남은 기간에 쓴다
  let d0 = Math.max(Math.min(...rows.map((r) => r.k.s)), NOW - 48);
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
    const x0 = X(k.s), x1 = open ? 100 : X(k.e + 1);
    const cut = k.s < d0; // 화면 왼쪽보다 먼저 시작
    let marks = `<i class="bar${open ? ' open' : ''}${cut ? ' cut' : ''}${k.status === 'done' ? ' done' : ''}" style="left:${pc(x0)};width:${pc(Math.max(x1 - x0, 0.6))}"></i>`;
    if (!open) marks += `<i class="dot${k.status === 'done' ? ' done' : ''}" style="left:${pc(x1)}"></i>`;

    const ps = ym(p.payStart);
    let tip = `${p.name} · ${ymDot(k.s)} ~ ${open ? '계속' : ymDot(k.e)} · ${p.cycle === 'Y' ? '연' : '월'} ${won(p.premium)}원`;
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
  const period = `${ymDot(k.s)} ~ ${k.e != null ? ymDot(k.e) + (ageEnd != null ? `(${ageEnd}세)` : '') : '계속'} · ${payLabel(k)}`;
  const when = k.status === 'paying' ? (k.left != null ? (k.left ? `완납까지 ${dur(k.left)}` : '이번 달이 마지막') : '')
    : k.status === 'before' ? `${ymDot(k.s)} 시작` : '';

  let meter = '', foot;
  if (k.status === 'cancelled') {
    foot = `<span>해지 ${ymDot(k.c)}</span><span>${won(k.paidAmt)}원 냄</span>`;
  } else if (k.e == null) {
    foot = `<span>계속 납입 · ${k.paidN}회째</span><span>지금까지 ${won(k.paidAmt)}원</span>`;
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
    <p>월 납입액과 납입기간만 넣으면 매달 얼마가 나가는지, 언제 다 내는지 한눈에 보여 드려요.</p>
    <button class="btn primary wide" data-act="add">＋ 첫 보험 추가</button>
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
    const total = Math.round(left / (1 - pct / 100));
    const paid = total - left;
    const start = NOW - (paid - 1) * per;
    $('#p-start').value = ymStr(start);
    out.textContent = `→ ${ymDot(start)} ~ ${ymDot(end)} · 총 ${total}회 중 ${paid}회 냄. 보험증권과 다르면 고쳐 주세요.`;
  } else {
    out.textContent = `→ 납입 끝 ${ymDot(end)} (남은 ${left}회). 납입 시작 월은 직접 넣어 주세요.`;
  }
  fromEnd();
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
  const err = !p.insurer ? '보험사를 넣어 주세요.'
    : !p.premium ? '납입액을 넣어 주세요.'
    : !p.start ? '납입 시작 월을 넣어 주세요.'
    : !open && !p.end ? '납입 기간(년)이나 납입 끝 월을 넣거나, 갱신형이면 체크해 주세요.'
    : p.end && ym(p.end) < ym(p.start) ? '납입 끝이 시작보다 빨라요.'
    : '';
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
      if (key === 'years') return p.end ? +((k.e - k.s + 1) / 12).toFixed(2) : '';
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
  if (idx.insurer == null || idx.premium == null || idx.start == null) { alert('첫 줄에 최소한 ‘보험사, 납입액, 납입시작’ 칸이 있어야 해요. ‘엑셀 입력 양식’을 받아서 써 보세요.'); return; }
  let added = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (k) => (idx[k] != null ? String(r[idx[k]] ?? '').trim() : '');
    const s = ym(get('start')), prem = digits(get('premium'));
    if (s == null || !prem) { skipped++; continue; }
    let e = ym(get('end'));
    const yrs = parseFloat(get('years'));
    if (e == null && yrs > 0) e = s + Math.round(yrs * 12) - 1;
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
  alert(`${added}건을 추가했어요.${skipped ? ` (납입액이나 납입시작이 없는 ${skipped}줄은 건너뜀)` : ''}`);
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

/* ── 버튼들 ── */
const actions = {
  add: () => openPolicy(null),
  settings: () => { renderMembers(); $('#dlgSettings').showModal(); },
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
