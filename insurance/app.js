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
/** 납입 시작: 'YYYY-MM-DD'(일자까지) 또는 'YYYY-MM'(예전 데이터) 로 맞춘다 */
function normYmd(v) {
  const m = String(v || '').trim().match(/^(\d{4})(?:\D*(\d{1,2}))?(?:\D*(\d{1,2}))?/);
  if (!m) return '';
  const mo = m[2] ? +m[2] : 1;
  if (mo < 1 || mo > 12) return '';
  return m[3] ? `${m[1]}-${pad(mo)}-${pad(Math.min(Math.max(+m[3], 1), 31))}` : `${m[1]}-${pad(mo)}`;
}
const dayOf = (v) => { const n = normYmd(v); return n.length === 10 ? +n.slice(8) : null; };
const startDot = (v) => normYmd(v).replace(/-/g, '.');
const toDateInput = (v) => { const n = normYmd(v); return n.length === 7 ? `${n}-01` : n; };
const ymStr = (i) => (i == null ? '' : `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`);
const ymDot = (i) => `${Math.floor(i / 12)}.${pad((i % 12) + 1)}`;
const nowIdx = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };
const dur = (m) => [Math.floor(m / 12) && `${Math.floor(m / 12)}년`, m % 12 && `${m % 12}개월`].filter(Boolean).join(' ') || '0개월';
/** 좁은 칸용 짧은 금액: 17,593,480 → 1,759만 / 1.8억 */
const short = (n) => {
  n = Math.round(n);
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e9 ? 0 : 1).replace(/\.0$/, '')}억`;
  return n >= 1e4 ? `${won(Math.round(n / 1e4))}만` : won(n);
};
/** 넓은 화면은 정확한 금액, 좁은 화면은 짧은 금액 (CSS가 하나만 보여 준다) */
const money2 = (n) => `<span class="w">${won(n)}</span><span class="n">${short(n)}</span>`;
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
    start: normYmd(p.start), end: ymStr(ym(p.end)), cover: String(p.cover || ''), payday: +p.payday || null,
    payStart: ymStr(ym(p.payStart)), payYears: +p.payYears || null, payAmt: +p.payAmt || null,
    cancel: ymStr(ym(p.cancel)), memo: String(p.memo || ''),
    claims: (Array.isArray(p.claims) ? p.claims : []).map((c) => ({
      id: String((c && c.id) || uid()), date: normDate(c && c.date), amount: Math.round(+(c && c.amount) || 0), memo: String((c && c.memo) || '').slice(0, 30),
    })).filter((c) => c.date && c.amount > 0),
  }));
  return { members, policies };
}

/* 받은 보험금: 보험마다 claims: [{ id, date: 'YYYY-MM-DD', amount, memo }] */
const claimsOf = (p) => p.claims || [];
const sumClaims = (ps) => ps.reduce((a, p) => a + claimsOf(p).reduce((b, c) => b + c.amount, 0), 0);
const countClaims = (ps) => ps.reduce((a, p) => a + claimsOf(p).length, 0);
/** '2024-03-15', '2024.3.15', '2024-03' → 'YYYY-MM-DD' (못 읽으면 '') */
function normDate(v) {
  const m = String(v || '').trim().match(/^(\d{4})\D*(\d{1,2})(?:\D*(\d{1,2}))?/);
  if (!m || +m[2] < 1 || +m[2] > 12) return '';
  const d = Math.min(Math.max(+(m[3] || 1), 1), 31);
  return `${m[1]}-${pad(+m[2])}-${pad(d)}`;
}
const dateDot = (d) => d.replace(/-/g, '.');
const dateIdx = (d) => { const [y, mo, da] = d.split('-').map(Number); return y * 12 + mo - 1 + (da - 1) / 31; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

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

  // 이번 달 보험료가 이미 나갔는지: 이체일(없으면 납입 시작 일자, 그것도 없으면 1일)이 지났으면 낸 것으로 본다
  const payDay = +p.payday || dayOf(p.start) || 1;
  const thru = new Date().getDate() >= payDay ? NOW : NOW - 1;
  let totalN = Infinity, paidN = null, remainN;
  if (s != null) {
    totalN = e != null ? Math.max(0, Math.floor((e - s) / per) + 1) : Infinity;
    paidN = Math.max(0, Math.min(totalN, Math.floor((Math.min(thru, e ?? thru) - s) / per) + 1));
    remainN = totalN - paidN;
  } else {
    // 시작 월을 모르면 낸 횟수는 모르고, 남은 횟수만 끝 월로 계산한다
    remainN = e != null ? Math.max(0, Math.floor((e - thru) / per)) : Infinity;
  }
  if (status === 'cancelled') remainN = 0;
  return {
    s, e, c, per, status, totalN, paidN, remainN,
    monthly: p.premium / per, // 연납은 월로 환산
    paidAmt: (paidN ?? 0) * p.premium,
    totalAmt: Number.isFinite(totalN) ? totalN * p.premium : null, // 계약 전체에 낼 돈
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
  $('#content').className = !empty && ui.view === 'list' ? 'cards' : '';
  $('#content').innerHTML = empty ? emptyHTML()
    : !live.length ? '<p class="none">등록된 보험이 없어요.</p>'
    : ui.view === 'list' ? live.slice().sort(byStatusThenPremium).map(cardHTML).join('')
    : timelineHTML(live);
  $('#events').innerHTML = empty ? '' : eventsHTML(live);
  $('#payouts').innerHTML = empty ? '' : payoutsHTML(live);
  $('#claims').innerHTML = empty ? '' : claimsHTML(list);
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
      <div><small>납부한 금액</small><b>${manwon(paid)}</b>${nNoStart ? `<em>시작 월 모르는 ${nNoStart}건 빼고</em>` : ''}</div>
      <div><small>남은 납부액</small><b>${manwon(remain)}</b>${nOpen ? `<em>갱신형 ${nOpen}건 빼고</em>` : ''}</div>
      <div class="claim" data-act="addClaim" role="button" tabindex="0"><small>받은 보험금</small><b>${manwon(sumClaims(list))}</b>
        <em>${countClaims(list) ? `${countClaims(list)}건${paid ? ` · 납부한 금액의 ${Math.round((sumClaims(list) / paid) * 100)}%` : ''}` : '아직 기록 없음 · 눌러서 기록'}</em></div>
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
  const w = Math.min(window.innerWidth, 1200);
  const cols = w <= 370 ? 162 : w >= 700 ? 316 : w >= 500 ? 220 : 186; // style.css 의 --nw + --aw + 간격
  const plotW = w - (w >= 700 ? 48 : 32) - 24 - cols;
  const step = [1, 2, 5, 10, 20].find((st) => (plotW * st * 12) / span >= 34) || 20;
  const ticks = [];
  for (let y = Math.ceil(d0 / 12 / step) * step; y * 12 < d1; y += step) { const x = X(y * 12); if (x > 4 && x < 96) ticks.push(y); }
  const focus = ui.who !== 'all' ? member(ui.who) : db.members[0];
  const today = NOW + (new Date().getDate() - 1) / 31;

  rows.sort((a, b) => db.members.indexOf(a.m) - db.members.indexOf(b.m) || (a.k.e ?? Infinity) - (b.k.e ?? Infinity) || b.k.monthly - a.k.monthly);
  const multi = new Set(rows.map((r) => r.m.id)).size > 1;

  const remainOf = (list) => list.reduce((a, r) => a + (r.k.status !== 'done' && r.k.remainAmt != null ? r.k.remainAmt : 0), 0);
  const paidOf = (list) => list.reduce((a, r) => a + r.k.paidAmt, 0);
  let body = '', last = null, total = 0, nClm = 0;
  for (const { p, k, m } of rows) {
    if (multi && m !== last) {
      last = m;
      const mine = rows.filter((r) => r.m === m);
      const sum = mine.filter((r) => r.k.status === 'paying').reduce((a, r) => a + r.k.monthly, 0);
      body += `<div class="tl-group"><i style="background:var(--m${m.slot})"></i>${esc(m.name)}<span><span class="gm">월 ${won(sum)} · </span>납부 ${money2(paidOf(mine))} · 남은 ${money2(remainOf(mine))}</span></div>`;
    }
    if (k.status === 'paying') total += k.monthly;
    const open = k.e == null;
    const x0 = k.s != null ? X(k.s) : 0, x1 = open ? 100 : X(k.e + 1);
    const cut = k.s == null || k.s < d0; // 화면 왼쪽보다 먼저 시작했거나 시작 월을 모름
    let marks = `<i class="bar${open ? ' open' : ''}${cut ? ' cut' : ''}${k.status === 'done' ? ' done' : ''}" style="left:${pc(x0)};width:${pc(Math.max(x1 - x0, 0.6))}"></i>`;
    if (!open) marks += `<i class="dot${k.status === 'done' ? ' done' : ''}" style="left:${pc(x1)}"></i>`;

    const ps = ym(p.payStart);
    let tip = `${p.name} · ${k.s != null ? startDot(p.start) : '시작 모름'} ~ ${open ? '계속' : ymDot(k.e)} · ${p.cycle === 'Y' ? '연' : '월'} ${won(p.premium)}원`;
    if (ps != null) {
      const pe = p.payYears ? ps + p.payYears * 12 : d1;
      marks += `<i class="recv${pe >= d1 ? ' open' : ''}" style="left:${pc(X(ps))};width:${pc(Math.max(X(pe) - X(ps), 0.6))}"></i>`;
      tip += ` · ${ymDot(ps)}부터 ${p.payYears ? `${p.payYears}년간` : '평생'} 받음`;
    }
    for (const c of claimsOf(p)) { // 보험금 받은 날 ◆
      const ci = dateIdx(c.date);
      if (ci >= d0 && ci <= d1) { marks += `<i class="clm" style="left:${pc(X(ci))}"></i>`; nClm++; }
    }
    if (claimsOf(p).length) tip += ` · 받은 보험금 ${won(sumClaims([p]))}원`;
    const age = ageAt(focus, open ? NOW : k.e);
    const lbl = open ? '갱신형 · 계속' : k.status === 'done' ? `${Math.floor(k.e / 12)} 완납` : `${Math.floor(k.e / 12)}${age != null ? ` · ${age}세` : ''}`;
    const lx = open ? x0 : x1;
    const paid = `<small>납부 ${k.paidN != null ? money2(k.paidAmt) : '?'}</small>`;
    const amt = k.status === 'done' ? `<b class="fin">완납</b>${paid}`
      : `<b>${won(k.monthly)}</b>${paid}<small>남은 ${k.remainAmt == null ? '갱신형' : money2(k.remainAmt)}</small>`;
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
    }).join('')}</span><span class="tl-h r">월납입액<small>납부 · 남은</small></span></div>
    ${body}
    <div class="tl-foot"><span>합계</span><span class="tl-track"><em style="left:${pc(X(today))}">오늘</em></span><span class="tl-amt"><b>${won(total)}</b><small>납부 ${money2(paidOf(rows))}</small><small>남은 ${money2(remainOf(rows))}</small></span></div>
  </div>
  <p class="tl-legend"><span><i class="lg-bar"></i>내는 기간</span><span><i class="lg-recv"></i>받는 기간</span><span><i class="lg-now"></i>오늘</span>${nClm ? '<span><i class="lg-clm"></i>보험금 받은 날</span>' : ''}${focus.birth ? `<span>나이: ${esc(focus.name)} 기준</span>` : ''}${hidden ? `<span>예전에 다 낸 ${hidden}건은 ‘보험별 상세’에</span>` : ''}</p>
  </div>`;
}

/** 보험 하나의 금액 칸들: 총 납부할 금액 · 납부한 금액 · 남은 납부액 (+ 받은 보험금) */
function amountBoxes(p, k) {
  const box = (label, val, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><small>${label}</small><b>${val}</b></div>`;
  const paid = k.paidN != null ? `${won(k.paidAmt)}원` : '시작 월 모름';
  let h = '';
  if (k.status === 'cancelled') h = box('납부한 금액', paid);
  else if (k.status === 'done') h = box('총 납부한 금액', paid);
  else {
    h = (k.e == null ? '' : box('총 납부할 금액', k.totalAmt != null ? `${won(k.totalAmt)}원` : '시작 월 모름'))
      + box('납부한 금액', paid)
      + box('남은 납부액', k.remainAmt != null ? `${won(k.remainAmt)}원` : '갱신형', 'rem');
  }
  if (claimsOf(p).length) h += box('받은 보험금', `${won(sumClaims([p]))}원 · ${claimsOf(p).length}건`, 'clm');
  return h;
}

function cardHTML(p) {
  const k = calc(p), m = member(p.who);
  const ageEnd = k.e != null ? ageAt(m, k.e) : null;
  const pl = payLabel(k);
  const period = `${k.s != null ? startDot(p.start) : '시작 ?'} ~ ${k.e != null ? ymDot(k.e) + (ageEnd != null ? `(${ageEnd}세)` : '') : '계속'}${pl ? ` · ${pl}` : ''}`;
  const when = k.status === 'paying' ? (k.left != null ? (k.left ? `완납까지 ${dur(k.left)}` : '이번 달이 마지막') : '')
    : k.status === 'before' ? `${startDot(p.start)} 시작` : '';

  // 납부율 막대 + 아래 칸들(총 납부할 금액 / 납부한 금액 / 남은 납부액)
  let meter = '', foot;
  if (k.status === 'cancelled') {
    foot = `<span>해지 ${ymDot(k.c)}</span><span></span>`;
  } else if (k.e == null) {
    foot = `<span>계속 납입${k.paidN != null ? ` · ${k.paidN}회째` : ''}</span><span></span>`;
  } else if (k.status === 'done') {
    if (k.pct != null) meter = '<div class="meter done"><i style="width:100%"></i></div>';
    foot = `<span class="ok">✓ 납입완료</span><span>${k.paidN != null ? `${k.paidN}회 냄` : ''}</span>`;
  } else if (k.pct != null) {
    const pct = k.pct * 100;
    meter = `<div class="meter"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    foot = `<span>${pct.toFixed(1)}% 납부 · ${k.paidN}/${k.totalN}회</span><span>남은 ${k.remainN}회</span>`;
  } else foot = `<span>남은 ${k.remainN}회</span><span></span>`;
  const amts = amountBoxes(p, k);
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
    <div class="pol-amts">${amts}</div>
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

/** 받은 보험금 카드: 합계, 사람별, 최근 순 목록 */
function claimsHTML(list) {
  const rows = list.flatMap((p) => claimsOf(p).map((c) => ({ p, c }))).sort((a, b) => b.c.date.localeCompare(a.c.date));
  const total = rows.reduce((a, r) => a + r.c.amount, 0);
  const multi = ui.who === 'all' && db.members.length > 1;
  const byWho = multi ? db.members.map((m) => ({ m, s: rows.filter((r) => r.p.who === m.id).reduce((a, r) => a + r.c.amount, 0) })).filter((x) => x.s) : [];
  return `<div class="card">
    <div class="card-h"><h3>받은 보험금</h3><button type="button" class="link" data-act="addClaim">＋ 기록하기</button></div>
    ${rows.length ? `<p class="claims-total"><b>${won(total)}원</b><span>${rows.length}건</span></p>
      ${byWho.length > 1 ? `<p class="claims-by">${byWho.map((x) => `<span style="--c:var(--m${x.m.slot})"><i></i>${esc(x.m.name)} ${won(x.s)}원</span>`).join('')}</p>` : ''}
      <ol class="ev clm">${rows.map(({ p, c }) => claimRow(p, c, multi)).join('')}</ol>`
    : '<p class="note">병원비·진단금 등 보험사에서 받은 돈을 기록하면 여기에 모여요.</p>'}
  </div>`;
}
const claimRow = (p, c, multi, inPolicy = false) => `<li data-claim="${c.id}" role="button" tabindex="0">
  <span class="ev-t">${dateDot(c.date)}</span>
  <span class="ev-n"><b>${esc(c.memo || '보험금')}</b>${inPolicy ? '' : `<small>${esc(p.name)}${multi ? ` · ${esc(member(p.who).name)}` : ''}</small>`}</span>
  <span class="ev-a">${won(c.amount)}원</span></li>`;

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
    <p>월 납입액과 납입기간만 넣으면 매달 얼마가 나가는지, 언제 다 내는지 한눈에 보여 드려요. 보험 앱 캡처나 보험증권 사진을 올리면 글자를 읽어서 채워 줘요.</p>
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
  set('start', toDateInput(p.start)); set('end', p.end); set('years', '');
  set('cover', p.cover); set('payday', p.payday); set('payStart', p.payStart); set('payYears', p.payYears);
  set('payAmt', p.payAmt ? won(p.payAmt) : ''); set('cancel', p.cancel); set('memo', p.memo);
  $('#p-open').checked = !!editing && !p.end;
  $('#h-pct').value = ''; $('#h-remain').value = ''; $('#h-out').textContent = '';
  $('#p-helper').open = false;
  $('#p-more').open = !!(p.cover || p.payday || p.payStart || p.cancel || p.memo);
  $('#pDel').hidden = !editing;
  $('#p-stats').hidden = !editing;
  if (editing) { const k = calc(editing); $('#p-stats').innerHTML = amountBoxes(editing, k); }
  renderPolicyClaims();
  $('#pScan').hidden = !!editing;
  $('#p-err').textContent = '';
  fromEnd(); syncOpen(); premiumHint();
  dlgP.showModal();
}

function renderPolicyClaims() {
  const el = $('#p-claims');
  el.hidden = !editing;
  if (!editing) return;
  const cs = claimsOf(editing).slice().sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = `<div class="card-h"><b>받은 보험금${cs.length ? ` · ${won(sumClaims([editing]))}원` : ''}</b>
    <button type="button" class="link" data-act="addClaimHere">＋ 추가</button></div>
    ${cs.length ? `<ol class="ev clm">${cs.map((c) => claimRow(editing, c, false, true)).join('')}</ol>` : '<p class="sub">아직 기록이 없어요.</p>'}`;
}

/* ── 받은 보험금 기록 ── */
let editingClaim = null; // { p, c }
const dlgC = $('#dlgClaim');
function openClaim(cid, pid) {
  if (!db.policies.length) { toast('먼저 보험을 추가해 주세요.'); return; }
  editingClaim = null;
  if (cid) for (const p of db.policies) { const c = claimsOf(p).find((x) => x.id === cid); if (c) { editingClaim = { p, c }; break; } }
  const c = editingClaim && editingClaim.c;
  const sel = editingClaim ? editingClaim.p.id
    : pid || (db.policies.find((p) => ui.who === 'all' || p.who === ui.who) || db.policies[0]).id;
  $('#c-policy').innerHTML = db.members.map((m) => {
    const ps = db.policies.filter((p) => p.who === m.id);
    return ps.length ? `<optgroup label="${esc(m.name)}">${ps.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}${p.insurer ? ` · ${esc(p.insurer)}` : ''}${calc(p).status === 'cancelled' ? ' (해지)' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  $('#cTitle').textContent = c ? '받은 보험금 수정' : '받은 보험금 기록';
  $('#c-date').value = c ? c.date : todayStr();
  $('#c-amount').value = c ? won(c.amount) : '';
  $('#c-amount-hint').textContent = c && c.amount >= 10000 ? manwon(c.amount) : '';
  $('#c-memo').value = c ? c.memo : '';
  $('#cDel').hidden = !c;
  $('#c-err').textContent = '';
  dlgC.showModal();
}
$('#fClaim').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = db.policies.find((x) => x.id === $('#c-policy').value);
  const amount = digits($('#c-amount').value), date = normDate($('#c-date').value);
  const err = !p ? '어느 보험인지 골라 주세요.' : !date ? '받은 날을 넣어 주세요.' : !amount ? '받은 금액을 넣어 주세요.' : '';
  if (err) { $('#c-err').textContent = err; return; }
  const rec = { id: editingClaim ? editingClaim.c.id : uid(), date, amount, memo: $('#c-memo').value.trim().slice(0, 30) };
  if (editingClaim) editingClaim.p.claims = claimsOf(editingClaim.p).filter((x) => x !== editingClaim.c);
  p.claims = [...claimsOf(p), rec];
  save(); dlgC.close(); render(); persist();
  if (dlgP.open) renderPolicyClaims();
  toast(`${editingClaim ? '고쳤어요' : '기록했어요'} · ${p.name} ${won(amount)}원`);
});
function deleteClaim() {
  if (!editingClaim || !confirm('이 보험금 기록을 지울까요?')) return;
  editingClaim.p.claims = claimsOf(editingClaim.p).filter((x) => x !== editingClaim.c);
  save(); dlgC.close(); render();
  if (dlgP.open) renderPolicyClaims();
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
    $('#p-start').value = `${ymStr(start)}-${pad(Math.min(+$('#p-payday').value || 1, 28))}`;
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
    start: normYmd(v('start')), end: open ? '' : ymStr(ym(v('end'))),
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

/** 엑셀 양식 CSV → [{who, insurer, ...}] (첫 줄에 보험사·납입액 칸이 없으면 null) */
function csvRecords(text) {
  const rows = parseCSV(String(text).trim());
  if (rows.length < 2) return null;
  const norm = (h) => h.replace(/\s|\(.*?\)/g, '');
  const idx = {};
  rows[0].forEach((h, i) => { const c = CSV_COLS.find(([k, label]) => norm(label) === norm(h) || k === h.trim()); if (c) idx[c[0]] = i; });
  if (idx.insurer == null || idx.premium == null) return null;
  return rows.slice(1).map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, String(r[i] ?? '').trim()])));
}

function importCSV(text) {
  const recs = csvRecords(text);
  if (!recs) { alert('첫 줄에 최소한 ‘보험사, 납입액’ 칸이 있어야 해요. ‘엑셀 입력 양식’을 받아서 써 보세요.'); return; }
  let added = 0, skipped = 0;
  for (const o of recs) {
    const get = (k) => o[k] || '';
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
      premium: prem, cycle: /연/.test(get('cycle')) ? 'Y' : 'M', start: normYmd(get('start')), end: ymStr(e),
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
      P(me, '현대해상', '현대 실손', '실손', 38500, '2017-04', '', { claims: [
        { id: uid(), date: '2025-08-12', amount: 132000, memo: '실손 병원비' }, { id: uid(), date: '2026-03-03', amount: 48500, memo: '통원' }] }),
      P(me, 'DB손해보험', 'DB 운전자', '운전자', 12800, '2021-02', '2041-01'),
      P(me, 'NH농협생명', '농협 정기', '정기', 45000, '2009-01', '2018-12'),
      P(me, '삼성생명', '삼성 저축', '저축', 150000, '2015-01', '2025-12', { cancel: '2020-02' }),
      P(sp, '삼성화재', '삼성 건강', '건강', 68800, '2015-06', '2035-05', { cover: '100세', claims: [{ id: uid(), date: '2024-06-02', amount: 1000000, memo: '수술비' }] }),
      P(sp, 'KB손해보험', 'KB 실손', '실손', 24300, '2019-10', ''),
      P(sp, '롯데손해보험', '롯데 간병', '간병', 50000, '2023-01', '2032-12'),
      P(kid, '현대해상', '현대 어린이', '어린이', 57650, '2016-05', '2046-04', { cover: '100세', memo: '카드 5% 할인', claims: [{ id: uid(), date: '2025-11-20', amount: 300000, memo: '입원비' }] }),
      P(kid, '흥국화재', '흥국 치아', '치아', 18900, '2024-03', '2034-02'),
    ],
  };
}

/* ── 사진으로 등록 (무료 · 폰 안에서 글자 인식) ──
 * 인쇄된 글자(보험 앱 캡처, 보험증권)는 폰 안에서 OCR(tesseract.js)로 읽는다. 사진은 밖으로 나가지 않는다.
 * 손글씨는 OCR이 못 읽으므로 '글자 붙여넣기'(갤러리 텍스트 추출 · Google 렌즈 · Claude 앱이 만든 표)를 쓴다.
 * 어느 쪽이든 확인 화면에서 고친 뒤 등록한다. */
const OCR_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const MAX_PHOTOS = 5;

const dlgS = $('#dlgScan');
let scanRows = [], scanNote = '', scanText = '', scanRun = null;
function scanStep(name) { $$('#dlgScan [data-step]').forEach((el) => { el.hidden = el.dataset.step !== name; }); if (!dlgS.open) dlgS.showModal(); }
function openScan() { if (dlgP.open) dlgP.close(); scanStep('choose'); }

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) { res(); return; }
    const el = document.createElement('script');
    el.src = src; el.async = true;
    el.onload = () => res();
    el.onerror = () => { el.remove(); rej(new Error('글자 인식 프로그램을 내려받지 못했어요. 인터넷 연결을 확인해 주세요.')); };
    document.head.append(el);
  });
}
let ocrWorker = null, ocrStage = ''; // 한 번 만든 인식기는 다시 쓴다
function getOcr() {
  if (!ocrWorker) {
    ocrWorker = loadScript(OCR_JS).then(() => window.Tesseract.createWorker('kor', 1, { logger: ocrLog }));
    ocrWorker.catch(() => { ocrWorker = null; });
  }
  return ocrWorker;
}
const OCR_MSG = {
  'loading tesseract core': '글자 인식 프로그램 받는 중', 'initializing tesseract': '준비 중',
  'loading language traineddata': '한글 인식 데이터 받는 중 (처음 한 번만)', 'initializing api': '준비 중', 'recognizing text': '글자 읽는 중',
};
function ocrLog(m) {
  const label = OCR_MSG[m.status];
  if (label && dlgS.open) $('#s-busy-msg').textContent = `${ocrStage}${label}${m.progress ? ` ${Math.round(m.progress * 100)}%` : ''}`;
}

/** 사진 → 글자 읽기 좋은 크기의 canvas (긴 변 2400px 이하) + 작은 미리보기 */
async function prepCanvas(file) {
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('사진을 열 수 없어요.')); img.src = URL.createObjectURL(file); });
  }
  const draw = (max) => {
    const sc = Math.min(1, max / Math.max(src.width, src.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(src.width * sc); cv.height = Math.round(src.height * sc);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  };
  return { canvas: draw(2400), thumb: draw(160).toDataURL('image/jpeg', 0.7) };
}

async function runOcr(files) {
  files = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)).slice(0, MAX_PHOTOS);
  if (!files.length) return;
  const run = { cancel: false };
  scanRun = run;
  scanStep('busy');
  $('#s-thumbs').innerHTML = '';
  $('#s-busy-msg').textContent = '사진 준비 중…';
  try {
    const pics = [];
    for (const f of files) {
      const pic = await prepCanvas(f);
      pics.push(pic);
      $('#s-thumbs').insertAdjacentHTML('beforeend', `<img src="${pic.thumb}" alt="">`);
    }
    const w = await getOcr();
    let text = '';
    for (let i = 0; i < pics.length; i++) {
      if (run.cancel) return;
      ocrStage = pics.length > 1 ? `사진 ${i + 1}/${pics.length} · ` : '';
      const { data } = await w.recognize(pics[i].canvas);
      text += `${data.text}\n\n`;
    }
    if (!run.cancel) reviewFromText(text, 'ocr');
  } catch (err) {
    if (!run.cancel) showScanError(err);
  }
}

function showScanError(err) {
  $('#s-error-msg').textContent = (err && err.message) || '알 수 없는 오류가 났어요.';
  scanStep('error');
}

function reviewFromText(text, source) {
  scanText = text;
  const raws = parseText(text);
  scanRows = raws.map(fromScan);
  scanNote = !raws.length
    ? (source === 'ocr'
      ? '보험을 찾지 못했어요. 손글씨나 흐린 사진은 폰 글자 인식이 잘 못 읽어요. ‘글자 붙여넣기’로 해 보세요.'
      : '보험을 찾지 못했어요. 보험사 이름과 금액(원)이 들어 있는지 확인해 주세요.')
    : source === 'ocr' ? '폰에서 글자를 읽은 결과예요. 숫자가 틀리기 쉬우니 꼭 확인해 주세요.' : '';
  renderScanRows();
  scanStep('review');
}

/* ── 읽은 글자 → 보험 목록 ──
 * 보험 앱 카드(보험사/상품명 → 월 보험료 → ○% 납부 ○원 남음), 보험증권(항목: 값),
 * 한 줄에 하나씩 적은 표(이름 … 금액 … 끝나는 해), 엑셀 양식 CSV를 모두 받는다. */
const INSURER_ALIASES = [
  ['삼성생명', ['삼성생명']], ['삼성화재', ['삼성화재']], ['한화생명', ['한화생명']], ['한화손해보험', ['한화손해', '한화손보']],
  ['교보생명', ['교보']], ['신한라이프', ['신한라이프', '신한생명', '오렌지라이프']], ['NH농협생명', ['농협생명', 'NH생명', 'NH농협생명']],
  ['NH농협손해보험', ['농협손해', 'NH손해', 'NH농협손해']], ['동양생명', ['동양생명']], ['미래에셋생명', ['미래에셋']],
  ['흥국생명', ['흥국생명']], ['흥국화재', ['흥국화재']], ['KB라이프', ['KB라이프', 'KB생명', '푸르덴셜']], ['KDB생명', ['KDB']],
  ['KB손해보험', ['KB손해', 'KB손보', 'LIG']], ['DB손해보험', ['DB손해', 'DB손보', '동부화재']], ['DB생명', ['DB생명', '동부생명']],
  ['현대해상', ['현대해상', '하이카']], ['메리츠화재', ['메리츠']], ['롯데손해보험', ['롯데']], ['AIA생명', ['AIA']],
  ['라이나생명', ['라이나']], ['메트라이프', ['메트라이프', 'METLIFE']], ['ABL생명', ['ABL', '알리안츠']], ['푸본현대생명', ['푸본']],
  ['처브라이프', ['처브']], ['하나손해보험', ['하나손해', '하나손보']], ['AXA손해보험', ['AXA', '악사']], ['우체국보험', ['우체국']],
  ['iM라이프', ['IM라이프', 'DGB생명']], ['새마을금고', ['새마을']], ['신협', ['신협']],
];
/** 글에서 가장 먼저 나오는 보험사 */
function findInsurer(t) {
  const up = String(t).toUpperCase();
  let best = '', at = Infinity;
  for (const [name, aliases] of INSURER_ALIASES) for (const a of aliases) { const i = up.indexOf(a.toUpperCase()); if (i >= 0 && i < at) { at = i; best = name; } }
  return best;
}
const TYPE_WORDS = [
  ['실손', /실손|실비|의료비/], ['암', /암보험|암진단|(^|\s)암(\s|$)|캔서/], ['치아', /치아|덴탈/], ['간병', /간병|치매|요양|케어/],
  ['운전자', /운전자|운전/], ['어린이', /어린이|자녀|태아|키즈/], ['연금', /연금/], ['저축', /저축|적립/], ['종신', /종신/],
  ['정기', /정기/], ['화재', /화재보험|주택|재물/], ['자동차', /자동차|다이렉트/], ['건강', /건강|보장|CI|질병|상해|통합|뇌|심장/],
];
const guessType = (t) => (TYPE_WORDS.find(([, re]) => re.test(t)) || ['기타'])[0];

/** 줄 안의 금액들. 연도·나이·회차·상품 번호·퍼센트는 뺀다. ok=false 는 쉼표 자리가 이상한 숫자(잘못 읽었을 가능성) */
function amounts(l) {
  const out = [];
  for (const m of l.matchAll(/(\d+(?:\.\d+)?)\s*만\s*원/g)) out.push({ v: Math.round(parseFloat(m[1]) * 10000), ok: true, won: true });
  for (const m of l.matchAll(/(\d[\d,.]*\d|\d)\s*([원%¢€₩]|세|년|회|건|만)?/g)) {
    const raw = m[1], tail = m[2] || '', plain = raw.replace(/[,.]/g, ''), v = +plain;
    if (/[세년회건만]/.test(tail)) continue;
    const grouped = /^\d{1,3}([,.]\d{3})+$/.test(raw);
    if (/\./.test(raw) && !grouped) continue;                         // 34.4 같은 소수, 2018.03.15 같은 날짜
    if (tail === '%' && plain.length <= 3) continue;                   // 진짜 퍼센트
    const won = tail !== '' && tail !== '%' || (tail === '%' && plain.length > 3); // OCR이 '원'을 %로 읽기도 함
    if (!won && !/[,]/.test(raw) && plain.length < 5) continue;        // 1704 같은 상품 번호, 2033 같은 연도
    if (!won && /^(19|20)\d{2}$/.test(plain)) continue;
    out.push({ v, ok: grouped || /^\d+$/.test(raw), won });
  }
  return out;
}

const LABEL = /^[^가-힣A-Za-z0-9]*(피보험자|계약자|보험\s*기간|보험료|납입|보험금|가입\s*금액|증권|수익자|특약|주계약|청약|계약일|가입일|보장\s*내용|월\s*보험료)/;
const PROD = /보험|공제|연금|플랜|케어|종신|실손|실비/;
const TITLE = /^내\s*보험|^\d{1,2}:\d{2}|보험\s*\d+\s*건/;
const isHead = (l) => !LABEL.test(l) && !/남음|납부/.test(l) && (PROD.test(l) || !!findInsurer(l));
const DATE = /((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})/g;

function parseText(text) {
  text = String(text || '').replace(/```[a-z]*/gi, '');
  const recs = csvRecords(text);
  if (recs) return recs.map(recToRaw);
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1 && !TITLE.test(l) && /[가-힣\d]/.test(l));
  const freq = {};
  for (const l of lines) { const n = findInsurer(l); if (n) freq[n] = (freq[n] || 0) + 1; }
  const common = (Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || [''])[0]; // 보험사가 안 보이는 카드에 쓴다

  const blocks = [];
  let cur = null;
  for (const l of lines) {
    const amt = amounts(l).filter((a) => a.v <= 10000000);
    const premLine = /보험료|납입액|납입\s*금액|월납|연납/.test(l) && amt.length > 0;
    const head = isHead(l);
    if (head && amt.length && !premLine) { // 한 줄에 이름과 금액이 같이 있는 표
      blocks.push({ lines: [l], prem: amt[amt.length - 1], inline: true });
      cur = null;
      continue;
    }
    if (head && (!cur || cur.prem)) { cur = { lines: [] }; blocks.push(cur); }
    if (!cur) { cur = { lines: [] }; blocks.push(cur); }
    cur.lines.push(l);
    if (premLine && !cur.prem) cur.prem = amt.find((a) => a.won) || amt[0];
  }
  return blocks.map((b) => blockToRaw(b, common)).filter((r) => r.premium > 0 && (r.insurer || r.product));
}

function blockToRaw(b, common) {
  const T = b.lines.join('\n');
  const insurer = findInsurer(T) || common;
  const prodLine = b.lines.filter((l) => PROD.test(l) && !LABEL.test(l) && !/남음|납부/.test(l)).sort((x, y) => y.length - x.length)[0] || '';
  const product = prodLine
    .replace(/\d[\d,.]*\s*(원|%)?/g, (m) => (b.inline ? ' ' : m))
    .replace(/[—–_~=·]+|-{2,}/g, ' ')
    .replace(/^[^가-힣A-Za-z]*(\((보험|저축|연금)\))?[^가-힣A-Za-z]*/, '')
    .replace(/\s+/g, ' ').trim();
  const type = guessType(`${product} ${T}`);
  const remLine = b.lines.find((l) => /남음/.test(l));
  const rem = remLine ? amounts(remLine).pop() : null;
  const pct = T.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*납부/);
  const yrs = T.match(/(\d{1,2})\s*년\s*납/) || T.match(/납입\s*기간\D{0,6}(\d{1,2})\s*년/);
  let start = '', end = '';
  for (const l of b.lines) {
    const ds = [...l.matchAll(DATE)].map((m) => `${m[1]}-${pad(+m[2])}`);
    if (!ds.length) continue;
    if (/납입\s*기간/.test(l) && ds.length > 1) { start = start || ds[0]; end = end || ds[ds.length - 1]; }
    else if (/납입\s*(만기|만료|종료|끝)/.test(l)) end = end || ds[ds.length - 1];
    else if (/계약일|가입일|계약\s*일자|청약일|납입\s*시작/.test(l)) start = start || ds[0];
    else if (/보험\s*기간/.test(l)) start = start || ds[0];
  }
  if (b.inline && !end) { // 손으로 적은 표: 줄 안의 20xx 중 가장 늦은 해를 끝나는 해로
    const ys = (T.match(/(?<![\d,.])20[1-9]\d(?![\d,.])/g) || []).map(Number);
    if (ys.length) end = String(Math.max(...ys));
  }
  const cover = (T.match(/(\d{2,3})\s*세\s*(만기|까지|보장)/) || [])[1];
  const unsure = !!b.inline || !(b.prem && b.prem.ok) || !!(rem && !rem.ok);
  const short = insurer.replace(/(생명|화재|손해보험|해상|라이프)$/, '');
  return {
    insured: (T.match(/피보험자\s*[:：]?\s*([가-힣]{2,4})/) || [])[1] || '',
    insurer, product, type,
    name: insurer ? `${short} ${type === '기타' ? '' : type}`.trim() : product.slice(0, 12),
    premium: b.prem ? b.prem.v : 0, cycle: /연납/.test(T) ? 'Y' : 'M',
    start, end, years: yrs ? +yrs[1] : 0, renewable: /갱신/.test(T) || type === '실손',
    paidPct: pct ? +pct[1] : 0, remainAmount: rem ? rem.v : 0,
    cover: cover ? `${cover}세` : /종신/.test(product) ? '종신' : '',
    payStart: '', payYears: 0, payAmt: 0, cancelled: /해지|실효/.test(T), cancelMonth: '', unsure, memo: '',
  };
}

/** 엑셀 양식 CSV(직접 쓴 것, Claude 앱이 만든 것) 한 줄 → 확인 화면용 */
function recToRaw(o) {
  const yrs = parseFloat(o.years) || 0;
  return {
    insured: o.who || '', insurer: o.insurer || '', name: o.name || '', product: o.product || '',
    type: TYPES.includes(o.type) ? o.type : guessType(`${o.type || ''} ${o.product || ''} ${o.name || ''}`),
    premium: digits(o.premium), cycle: /연/.test(o.cycle || '') ? 'Y' : 'M', start: o.start || '', end: o.end || '', years: yrs,
    renewable: !o.end && !yrs, paidPct: 0, remainAmount: 0, cover: o.cover || '',
    payStart: o.payStart || '', payYears: parseInt(o.payYears, 10) || 0, payAmt: digits(o.payAmt),
    cancelled: !!o.cancel, cancelMonth: o.cancel || '', unsure: false, memo: o.memo || '',
  };
}

const CLAUDE_PROMPT = () => `이 사진 속 보험들을 아래 첫 줄 형식의 CSV로만 답해 줘. 첫 줄은 그대로 쓰고 보험 하나당 한 줄, 모르는 칸은 비워 둬. 금액은 숫자만, 날짜는 YYYY-MM (연도만 알면 YYYY). 줄을 그어 지운 보험은 해지월 칸에 '해지'라고 적어 줘. 아이디·비밀번호 같은 개인정보는 적지 마.
${CSV_COLS.map((c) => c[1]).join(',')}`;
async function copyPrompt() {
  const t = CLAUDE_PROMPT();
  try { await navigator.clipboard.writeText(t); toast('복사했어요. Claude 앱에 사진과 함께 붙여넣고, 받은 표를 여기에 붙여넣으세요.'); }
  catch { $('#s-text').value = t; $('#s-text').select(); toast('자동 복사가 안 돼서 아래 칸에 넣어 뒀어요. 길게 눌러 복사하세요.'); }
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
  if (r.unsure) warn.push('숫자를 확실히 못 읽었어요. 금액·연도를 꼭 확인해 주세요');

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
  $('#s-raw').textContent = scanText;
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
        <label>납입 시작 <small>모르면 비움</small><input type="date" data-f="start" value="${toDateInput(r.start)}"></label>
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
  r[f] = f === 'start' ? normYmd(el.value) : f === 'end' ? ymStr(ym(el.value)) : el.value.trim();
  if (f === 'name' || f === 'insurer') $('.srow-on b', row).textContent = r.name || r.insurer || '이름 없음';
});
$('#s-rows').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
$('#scanFile').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; runOcr(fs); });
dlgS.addEventListener('close', () => { if (scanRun) scanRun.cancel = true; });

let toastT;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ── 버튼들 ── */
const actions = {
  add: () => openPolicy(null),
  settings: () => { renderMembers(); $('#dlgSettings').showModal(); },
  scan: openScan,
  saveScan,
  scanMore: () => scanStep('choose'),
  pickPhoto: () => $('#scanFile').click(),
  pasteMode: () => { $('#s-text').value = ''; scanStep('paste'); },
  editText: () => { $('#s-text').value = scanText; scanStep('paste'); },
  parsePaste: () => { const t = $('#s-text').value; if (t.trim()) reviewFromText(t, 'paste'); else toast('글자를 먼저 붙여넣어 주세요.'); },
  copyPrompt,
  cancelScan: () => { if (scanRun) scanRun.cancel = true; dlgS.close(); },
  addMember: () => openMember(null),
  addClaim: () => openClaim(null, null),
  addClaimHere: () => { if (editing) openClaim(null, editing.id); },
  deleteClaim,
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
  const t = e.target.closest('[data-act],[data-who],[data-view],[data-id],[data-member],[data-close],[data-years],[data-claim],[data-memo]');
  if (!t) return;
  if (t.hasAttribute('data-close')) { t.closest('dialog').close(); return; }
  if (t.dataset.who) { ui.who = t.dataset.who; saveUI(); render(); return; }
  if (t.dataset.view) { ui.view = t.dataset.view; saveUI(); render(); return; }
  if (t.dataset.years) { $('#p-years').value = t.dataset.years; fromYears(); return; }
  if (t.dataset.member) { openMember(t.dataset.member); return; }
  if (t.dataset.claim) { openClaim(t.dataset.claim); return; }
  if (t.dataset.memo) { $('#c-memo').value = t.dataset.memo; return; }
  if (t.dataset.act) { actions[t.dataset.act](t); return; }
  if (t.dataset.id) openPolicy(t.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-id],[role=button][data-claim],[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});
// 시트 바깥(어두운 부분)을 누르면 닫기
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

$$('input.money').forEach((el) => el.addEventListener('input', () => {
  const n = digits(el.value); el.value = n ? won(n) : '';
  if (el.id === 'p-premium') premiumHint();
  if (el.id === 'c-amount') $('#c-amount-hint').textContent = n >= 10000 ? manwon(n) : '';
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
