/* 분석 함수 — 엑셀(아파트_대장비교_분석_v6)과 같은 규칙
   거래 행: {d: 20260921(계약일), ym: 202609, p: 만원, f: 층, a: 전용면적, cancel: 해제여부, direct: 직거래여부}
*/
const A = (() => {
  const START_YM = 200601;
  function nowYm() {
    const d = new Date();
    return d.getFullYear() * 100 + (d.getMonth() + 1);
  }
  function monthsBetween(a, b) {
    const out = [];
    let y = Math.floor(a / 100), m = a % 100;
    while (y * 100 + m <= b) {
      out.push(y * 100 + m);
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }
  const MONTHS = monthsBetween(START_YM, nowYm());
  const MI = {}; MONTHS.forEach((m, i) => MI[m] = i);
  function addMonths(ym, k) {
    let y = Math.floor(ym / 100), m = ym % 100 - 1 + k;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y * 100 + m + 1;
  }
  function mdiff(a, b) {
    if (!a || !b) return null;
    return (Math.floor(b / 100) - Math.floor(a / 100)) * 12 + (b % 100 - a % 100);
  }
  function med(arr) {
    const a = arr.slice().sort((x, y) => x - y); const n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function q3(arr) {
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(0.75 * a.length))];
  }
  function valid(rows) { return rows.filter(r => !r.cancel && !r.direct); }

  /* 이상 저가·고가 제외: 앞뒤 3개월 이웃(자기 제외) 3건 이상일 때 Q3의 0.7배 미만 또는 1.4배 초과 */
  function clean(rows) {
    const byI = {};
    for (const r of rows) (byI[MI[r.ym]] = byI[MI[r.ym]] || []).push(r);
    const out = [], drop = [];
    for (const r of rows) {
      const i = MI[r.ym]; const nb = [];
      for (let j = i - 3; j <= i + 3; j++) if (byI[j]) for (const x of byI[j]) if (x !== r) nb.push(x.p);
      if (nb.length >= 3) { const q = q3(nb); if (r.p < q * 0.7 || r.p > q * 1.4) { drop.push(r); continue; } }
      out.push(r);
    }
    return { rows: out, drop };
  }
  /* 시세: 최근 3개월(그 달 포함) 실거래 중간값 */
  function sOf(rows) {
    const bm = {};
    for (const r of rows) (bm[r.ym] = bm[r.ym] || []).push(r.p);
    const S = new Array(MONTHS.length).fill(null), N = new Array(MONTHS.length).fill(0);
    MONTHS.forEach((ym, i) => {
      let a = [];
      for (let j = Math.max(0, i - 2); j <= i; j++) if (bm[MONTHS[j]]) a = a.concat(bm[MONTHS[j]]);
      if (a.length) { S[i] = med(a); N[i] = a.length; }
    });
    return { S, N, bm };
  }
  /* 사이클: 고점(2020-07~2022-12 시세 최고), -10% 진입, 1차 저점(~2023-12), 전체 저점, 회복, 붐 시작 */
  function cycle(rows0) {
    const rows1 = valid(rows0);
    const c = clean(rows1); const rows = c.rows;
    const { S, N, bm } = sOf(rows);
    const has = i => !!bm[MONTHS[i]];
    const hs = []; for (let i = 0; i < MONTHS.length; i++) if (has(i)) hs.push(i);
    const o = { n: rows.length, drop: c.drop, S, N, bm, valid2022: rows.filter(r => r.ym >= 202007 && r.ym <= 202212).length };
    if (!hs.length) return o;
    const firstI = hs[0]; let lastI = -1; for (const i of hs) if (S[i] != null) lastI = i;
    o.first = MONTHS[firstI]; o.last = MONTHS[lastI]; o.lv = S[lastI];
    const win = hs.filter(i => MONTHS[i] >= 202007 && MONTHS[i] <= 202212 && S[i] != null);
    if (!win.length || o.valid2022 < 3) return o;
    let pk = win[0]; for (const i of win) if (S[i] > S[pk]) pk = i;
    o.pk = MONTHS[pk]; o.pv = S[pk];
    const bef = hs.filter(i => i < pk && i >= pk - 36 && S[i] != null);
    if (bef.length) { let st = bef[0]; for (const i of bef) if (S[i] <= S[st]) st = i; o.st = MONTHS[st]; o.sv = S[st]; o.stFirst = (st === firstI || firstI >= pk - 36) ? 1 : 0; }
    const aft = hs.filter(i => i > pk && S[i] != null);
    if (aft.length) {
      const d = aft.find(i => S[i] <= S[pk] * 0.9); o.d10 = d != null ? MONTHS[d] : null;
      let tr = aft[0]; for (const i of aft) if (S[i] < S[tr]) tr = i; o.tr = MONTHS[tr]; o.tv = S[tr];
      const a23 = aft.filter(i => MONTHS[i] <= 202312);
      if (a23.length) {
        let t1 = a23[0]; for (const i of a23) if (S[i] < S[t1]) t1 = i; o.t1 = MONTHS[t1]; o.t1v = S[t1];
        const rc = aft.find(i => i > t1 && S[i] >= S[pk]); o.rec = rc != null ? MONTHS[rc] : null;
      }
    }
    // 고점권(고점의 95% 이상)
    const end = o.d10 || 202312;
    const pl = hs.filter(i => S[i] != null && MONTHS[i] >= 202007 && MONTHS[i] <= Math.min(end, 202312) && S[i] >= o.pv * 0.95).map(i => MONTHS[i]);
    if (pl.length) o.plateau = [pl[0], pl[pl.length - 1]];
    return o;
  }
  /* 월별 고가·저가·중간값·건수 */
  function monthly(rows0) {
    const rows = valid(rows0); const bm = {};
    for (const r of rows) (bm[r.ym] = bm[r.ym] || []).push(r);
    const out = [];
    for (const ym of Object.keys(bm).map(Number).sort((a, b) => a - b)) {
      const rs = bm[ym]; let hi = rs[0], lo = rs[0];
      for (const r of rs) { if (r.p > hi.p) hi = r; if (r.p < lo.p) lo = r; }
      out.push({ ym, hi: hi.p, hif: hi.f, lo: lo.p, lof: lo.f, n: rs.length, med: med(rs.map(r => r.p)) });
    }
    return out;
  }
  /* 역대 최고 / 저점(2022년 이후) / 전고점(2020~2022) / 최근 */
  function extremes(rows0) {
    const rows = valid(rows0);
    if (!rows.length) return null;
    const mx = rows.reduce((a, r) => (r.p > a.p || (r.p === a.p && r.d < a.d)) ? r : a, rows[0]);
    const maxs = rows.filter(r => r.p === mx.p).sort((a, b) => a.d - b.d);
    const r22 = rows.filter(r => r.ym >= 202201);
    const lo = r22.length ? r22.reduce((a, r) => (r.p < a.p || (r.p === a.p && r.d < a.d)) ? r : a, r22[0]) : null;
    const dropSet = new Set(clean(rows).drop);
    const r22b = r22.filter(r => r.f >= 4 && !dropSet.has(r));
    const lob = r22b.length ? r22b.reduce((a, r) => (r.p < a.p || (r.p === a.p && r.d < a.d)) ? r : a, r22b[0]) : null;
    const win = rows.filter(r => r.ym >= 202007 && r.ym <= 202212);
    const pk = win.length >= 2 ? win.reduce((a, r) => (r.p > a.p || (r.p === a.p && r.d < a.d)) ? r : a, win[0]) : null;
    const pks = pk ? win.filter(r => r.p === pk.p).sort((a, b) => a.d - b.d) : [];
    const last = rows.reduce((a, r) => r.d > a.d ? r : a, rows[0]);
    const td = new Date(); const cutD = k => { const x = new Date(td.getFullYear(), td.getMonth() - k, td.getDate()); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); };
    const rec3 = rows.filter(r => r.d >= cutD(3));   // 오늘 기준 최근 3개월
    const rec12 = rows.filter(r => r.d >= cutD(12)); // 오늘 기준 최근 12개월
    return { n: rows.length, first: Math.min(...rows.map(r => r.d)), max: mx, maxs, lo22: lo, lo22b: lob, pk2022: pk, pk2022s: pks, last, rec3, rec3med: rec3.length ? med(rec3.map(r => r.p)) : null, rec12, rec12med: rec12.length ? med(rec12.map(r => r.p)) : null };
  }
  /* 지역 지수: 단지×전용(정수) 고정효과, 2022-01=100, 3개월 이동평균 */
  function feIndex(rowsAll, baseYm) {
    const g = {};
    for (const r of rowsAll) { if (r.cancel || r.direct) continue; const k = r.nm + '|' + r.dong + '|' + Math.floor(r.a); (g[k] = g[k] || []).push(r); }
    const T = MONTHS.length; const tr = []; let ci = 0;
    for (const k in g) { if (g[k].length < 10) continue; const c = clean(g[k]).rows; for (const r of c) tr.push([ci, MI[r.ym], Math.log(r.p)]); ci++; }
    if (!ci) return null;
    const a = new Array(ci).fill(0), b = new Array(T).fill(null), cnt = new Array(T).fill(0);
    { const s = new Array(ci).fill(0), n = new Array(ci).fill(0); for (const x of tr) { s[x[0]] += x[2]; n[x[0]]++; } for (let i = 0; i < ci; i++) a[i] = s[i] / n[i]; }
    for (let it = 0; it < 60; it++) {
      const s = new Array(T).fill(0), n = new Array(T).fill(0); for (const x of tr) { s[x[1]] += x[2] - a[x[0]]; n[x[1]]++; }
      for (let t = 0; t < T; t++) { b[t] = n[t] ? s[t] / n[t] : null; cnt[t] = n[t]; }
      const s2 = new Array(ci).fill(0), n2 = new Array(ci).fill(0); for (const x of tr) { if (b[x[1]] == null) continue; s2[x[0]] += x[2] - b[x[1]]; n2[x[0]]++; }
      for (let i = 0; i < ci; i++) if (n2[i]) a[i] = s2[i] / n2[i];
    }
    for (let t = 0; t < T; t++) { if (b[t] == null || cnt[t] < 4) { let p = t - 1; while (p >= 0 && (b[p] == null || cnt[p] < 4)) p--; let q = t + 1; while (q < T && (b[q] == null || cnt[q] < 4)) q++; b[t] = (p >= 0 && q < T) ? (b[p] + (b[q] - b[p]) * (t - p) / (q - p)) : (p >= 0 ? b[p] : (q < T ? b[q] : 0)); } }
    const base = b[MI[baseYm || 202201]];
    const I = b.map(v => 100 * Math.exp(v - base));
    const Sm = I.map((v, t) => { const w = [I[t - 1], v, I[t + 1]].filter(x => x != null && !isNaN(x)); return w.reduce((x, y) => x + y, 0) / w.length; });
    return { I, Sm, cnt, nSer: ci, nTr: tr.length };
  }
  function yoy(v) { return v.map((x, i) => (i < 12 || v[i - 12] == null || x == null) ? null : x / v[i - 12] - 1); }
  function runs(flags, minlen) {
    const out = []; let s = null;
    flags.concat([false]).forEach((f, i) => { if (f && s === null) s = i; if (!f && s !== null) { if (i - s >= (minlen || 3)) out.push([s, i - 1]); s = null; } });
    return out;
  }
  function phases(v) {
    const y = yoy(v);
    return { booms: runs(y.map(x => x != null && x >= 0.10)).map(([a, b]) => [MONTHS[a], MONTHS[b]]), busts: runs(y.map(x => x != null && x <= -0.10)).map(([a, b]) => [MONTHS[a], MONTHS[b]]) };
  }
  function indexStats(v) {
    const win = []; for (let i = 0; i < MONTHS.length; i++) if (MONTHS[i] >= 202007 && MONTHS[i] <= 202212 && v[i] != null) win.push(i);
    if (!win.length) return null;
    const mx = Math.max(...win.map(i => v[i])); const pk = Math.max(...win.filter(i => v[i] >= mx - 0.049));
    const after = []; for (let i = pk + 1; i < v.length; i++) if (v[i] != null) after.push(i);
    const a23 = after.filter(i => MONTHS[i] <= 202312);
    const t1 = a23.length ? a23.reduce((a, i) => v[i] < v[a] ? i : a, a23[0]) : null;
    const tr = after.length ? after.reduce((a, i) => v[i] < v[a] ? i : a, after[0]) : null;
    const d10 = after.find(i => v[i] <= v[pk] * 0.9);
    const rec = t1 != null ? after.find(i => i > t1 && v[i] >= v[pk]) : null;
    const lastI = (() => { for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return i; })();
    return { pk: MONTHS[pk], pkv: v[pk], t1: t1 != null ? MONTHS[t1] : null, t1v: t1 != null ? v[t1] : null, tr: tr != null ? MONTHS[tr] : null, trv: tr != null ? v[tr] : null, d10: d10 != null ? MONTHS[d10] : null, rec: rec != null ? MONTHS[rec] : null, now: v[lastI], nowYm: MONTHS[lastI] };
  }
  /* 직전 최고 대비 위치 → 색 띠 */
  const DD = [['신고가', '#D9534F'], ['고점권(-3% 이내)', '#F3B4AC'], ['조정(-3~-10%)', '#F6E7B1'], ['하락(-10~-20%)', '#BFD4EE'], ['급락(-20% 이상)', '#5B8FD0']];
  function ddColors(vals) {
    const out = new Array(vals.length).fill(null); let rm = null;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i]; if (v == null) continue;
      if (rm === null) { rm = v; out[i] = [DD[1][1], 0]; continue; }
      if (v > rm * 1.0000001) { rm = v; out[i] = [DD[0][1], 0]; continue; }
      const dd = v / rm - 1;
      out[i] = [dd >= -0.03 ? DD[1][1] : dd > -0.10 ? DD[2][1] : dd > -0.20 ? DD[3][1] : DD[4][1], dd];
    }
    return out;
  }
  /* 대장: 전용 84㎡(82~86) 최근 12개월 실거래 중간값 1위(10건 이상) */
  function pickBoss(complexes, refYm) {
    const from = addMonths(refYm || nowYm(), -12);
    const cands = [];
    for (const c of complexes) {
      const rs = valid(c.rows).filter(r => r.ym > from && r.a >= 82 && r.a < 86);
      if (rs.length >= 10) cands.push({ c, med: med(rs.map(r => r.p)), n: rs.length });
    }
    cands.sort((x, y) => y.med - x.med || y.n - x.n);
    return cands;
  }
  /* 금액 표기 */
  function won(v) {
    if (v == null || isNaN(v)) return '';
    v = Math.round(v); const neg = v < 0; v = Math.abs(v);
    const e = Math.floor(v / 10000), r = v % 10000; let s;
    if (e === 0) s = r.toLocaleString() + '만';
    else if (r === 0) s = e + '억';
    else if (r % 1000 === 0) s = e + '억 ' + (r / 1000) + '천';
    else s = e + '억 ' + r.toLocaleString() + '만';
    return (neg ? '-' : '') + s;
  }
  function ymk(ym) { if (!ym) return ''; return Math.floor(ym / 100) + '년 ' + (ym % 100) + '월'; }
  function dk(d, f) { const s = Math.floor(d / 10000) + '년 ' + (Math.floor(d / 100) % 100) + '월'; return f != null ? s + ' (' + f + '층)' : s; }
  function pct(x, d) { if (x == null || isNaN(x)) return ''; const n = (x * 100).toFixed(d == null ? 1 : d); return (x > 0 ? '+' : '') + n + '%'; }
  function pyeong(sup) { return Math.round(sup / 3.3058); }
  function groupOf(area) { return Math.floor(area); }
  function labelFor(g, sup) { return sup ? pyeong(sup) + '평(전용 ' + g + '㎡)' : '약 ' + Math.round(g / 0.75 / 3.3058) + '평(전용 ' + g + '㎡)'; }
  return { MONTHS, MI, nowYm, addMonths, mdiff, med, q3, valid, clean, sOf, cycle, monthly, extremes, feIndex, yoy, phases, indexStats, DD, ddColors, pickBoss, won, ymk, dk, pct, pyeong, groupOf, labelFor, monthsBetween };
})();
if (typeof module !== 'undefined') module.exports = A;
