/* 화면 — 비교 / 사이클 / 자료 / 설정 */
const S = { regions: null, seed: null, sido: '41', lawd: '41220', region: null, regionsCache: {}, cols: [], tab: 'compare', charts: {}, sug: { items: [], on: -1, remote: [], remoteFor: '', open: false }, lastRefresh: null };
const $ = s => document.querySelector(s);
const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEYS = ['gold', 'gwang', 'dongdo', 'cent1', 'hills', 'thesharp'];
const ROLE_COLORS = ['r0', 'r1', 'r2', 'r3'];
const norm = s => String(s || '').replace(/[\s\-\.·()（）]/g, '').toLowerCase();
function hm(t) { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function ymdhm(t) { const d = new Date(t); return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hm(t); }

/* ---------- 시작 ---------- */
async function boot() {
  const [reg, seed] = await Promise.all([fetch('data/regions.json').then(r => r.json()), fetch('data/seed.json').then(r => r.json())]);
  S.regions = reg; S.seed = seed;
  try { const st = JSON.parse(localStorage.getItem('ui_state') || '{}'); if (st.sido) S.sido = st.sido; if (st.lawd) S.lawd = st.lawd; if (st.cols) S.savedCols = st.cols; } catch (e) { }
  fillSido(); fillSgg();
  bindUI();
  document.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => showTab('settings')));
  renderLegend(); renderPolList();
  checkKey(); checkKb();
  await selectRegion(S.lawd, true);
  if (S.savedCols && S.savedCols.length) { for (const c of S.savedCols) await addColumn(c.lawd, c.key, c.g, true); }
  else if (S.lawd === '41220') { await addColumn('41220', '힐스테이트지제역|동삭동', null, true); await addColumn('41465', '힐스테이트광교산|신봉동', null, true); }
  renderAll();
  // 방문 수는 10분마다 보이는 동안 다시 받음
  setInterval(() => { if (!document.hidden && S.cols.length) refreshKbOnly(); }, 600000);
}
function saveState() { try { localStorage.setItem('ui_state', JSON.stringify({ sido: S.sido, lawd: S.lawd, cols: S.cols.filter(c => c.role !== 'boss').map(c => ({ lawd: c.lawd, key: c.key, g: c.g })) })); } catch (e) { } }
function fillSido() {
  const sel = $('#selSido'); sel.innerHTML = '';
  for (const s of S.regions.sido) sel.appendChild(el('option', { value: s.code }, esc(s.name)));
  sel.value = S.sido;
}
function fillSgg() {
  const sel = $('#selSgg'); sel.innerHTML = '';
  const list = (S.regions.sgg[S.sido] || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  for (const g of list) sel.appendChild(el('option', { value: g.code }, esc(g.name)));
  if (list.find(g => g.code === S.lawd)) sel.value = S.lawd; else if (list.length) { S.lawd = list[0].code; sel.value = S.lawd; }
}
function regionName(lawd) {
  for (const sd of S.regions.sido) for (const g of (S.regions.sgg[sd.code] || [])) if (g.code === lawd) return (sd.short || sd.name) + ' ' + g.name;
  return lawd;
}
function regionFullName(lawd) { // KB 검색용: "경기도 용인시 수지구"
  for (const sd of S.regions.sido) for (const g of (S.regions.sgg[sd.code] || [])) if (g.code === lawd) return sd.name + ' ' + g.name;
  return null;
}
function sggName(lawd) { for (const k in S.regions.sgg) for (const g of S.regions.sgg[k]) if (g.code === lawd) return g.name; return lawd; }
function hasRegion(lawd) { for (const k in S.regions.sgg) for (const g of S.regions.sgg[k]) if (g.code === lawd) return true; return false; }
function bindUI() {
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#selSido').addEventListener('change', async e => { S.sido = e.target.value; fillSgg(); await selectRegion(S.lawd); });
  $('#selSgg').addEventListener('change', async e => { await selectRegion(e.target.value); });
  $('#btnAdd').addEventListener('click', onAdd);
  const inp = $('#inpCx');
  inp.addEventListener('input', () => { S.sug.on = -1; renderSug(); fetchRemote(); });
  inp.addEventListener('focus', () => { renderSug(); });
  inp.addEventListener('keydown', e => {
    const n = S.sug.items.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); S.sug.on = (S.sug.on + 1) % n; paintSug(); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); S.sug.on = (S.sug.on - 1 + n) % n; paintSug(); }
    else if (e.key === 'Enter') { e.preventDefault(); onAdd(); }
    else if (e.key === 'Escape') { closeSug(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.sugwrap')) closeSug(); });
  $('#btnLoadAll').addEventListener('click', () => loadRegionAll(S.lawd));
  $('#btnRefresh').addEventListener('click', refreshAll);
  $('#btnSaveKey').addEventListener('click', onSaveKey);
  $('#btnShowKey').addEventListener('click', () => { const i = $('#inpKey'); i.type = i.type === 'password' ? 'text' : 'password'; $('#btnShowKey').textContent = i.type === 'password' ? '보기' : '숨기기'; });
  $('#btnTestKb').addEventListener('click', checkKb);
  $('#btnClearCache').addEventListener('click', async () => { await DB.clear(); S.regionsCache = {}; cacheInfo(); alert('저장된 자료를 지웠습니다. 지역을 다시 고르면 새로 받습니다.'); });
  $('#btnCsvCmp').addEventListener('click', () => downloadCsv('비교표', csvCompare()));
  $('#btnCsvMonthly').addEventListener('click', () => downloadCsv('월별실거래', csvMonthly()));
  $('#inpKey').value = RT.key();
}
function showTab(t) {
  S.tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
  if (t === 'cycle') renderCycle();
  if (t === 'data') renderMonthly();
  if (t === 'settings') cacheInfo();
  window.scrollTo({ top: 0 });
}

/* ---------- 연결 상태 ---------- */
async function checkKey() {
  const p = $('#pillKey');
  if (!RT.key()) { p.textContent = '실거래 키 없음'; p.className = 'pill bad'; S.keyOk = false; return; }
  try { const r = await RT.test('41465'); S.keyOk = true; p.textContent = '실거래 연결됨'; p.className = 'pill ok'; }
  catch (e) { S.keyOk = false; p.textContent = '실거래 연결 안 됨'; p.className = 'pill bad'; p.title = e.message; }
  renderRegionHint();
}
async function checkKb() {
  const p = $('#pillKb'); const out = $('#kbResult');
  try { const top = await KB.test(); S.kbOk = true; p.textContent = 'KB 연결됨'; p.className = 'pill ok'; if (out) { out.className = 'result ok'; out.textContent = '연결됐습니다 (' + ymdhm(Date.now()) + '). 지금 전국 방문 수 상위: ' + top.join(', '); } }
  catch (e) { S.kbOk = false; p.textContent = 'KB 연결 안 됨'; p.className = 'pill bad'; if (out) { out.className = 'result bad'; out.textContent = 'KB부동산에서 응답을 받지 못했습니다. ' + e.message + '\nKB시세·호가 없이 실거래 기준으로만 보여 줍니다.'; } }
}
async function onSaveKey() {
  RT.setKey($('#inpKey').value);
  const out = $('#keyResult'); out.className = 'result'; out.innerHTML = '<span class="spin"></span> 용인시 수지구 지난달 거래를 불러오는 중…';
  try {
    const r = await RT.test('41465');
    out.className = 'result ok';
    out.textContent = '연결됐습니다 (공공데이터포털 "' + RT.serviceName() + '" 서비스). 용인시 수지구 ' + A.ymk(A.addMonths(A.nowYm(), -1)) + ' 신고 ' + r.total + '건.\n' + r.sample.map(x => x.nm + ' 전용 ' + x.a + '㎡ ' + A.won(x.p) + ' (' + x.f + '층, ' + x.d + ')').join('\n') + '\n\n이제 비교 탭에서 어느 시·군·구를 골라도 최근 24개월 실거래가 들어옵니다.';
    await checkKey();
    await selectRegion(S.lawd, true);
    renderAll();
  } catch (e) {
    out.className = 'result bad';
    let msg = e.message;
    if (/연결 실패/.test(msg)) msg += '\n브라우저에서 국토교통부 서버를 직접 부르지 못했습니다(차단 또는 네트워크). 키가 맞다면 PC에서 받아 두는 방식으로 바꿔야 합니다.';
    if (/SERVICE_KEY_IS_NULL/.test(msg)) msg += '\n키가 비어 있습니다. 공공데이터포털 마이페이지 → 개발계정 상세의 "일반 인증키"를 그대로 붙여 넣으세요.';
    else if (/NOT_REGISTERED|ACCESS_DENIED|UNREGISTERED|접근거부|등록되지 않은/i.test(msg)) msg += '\n이 키로 "아파트 매매 실거래가 자료"(기본)와 "…상세 자료" 두 서비스를 모두 불러 봤지만 등록된 서비스가 아니라고 합니다. 공공데이터포털에서 "국토교통부_아파트 매매 실거래가 자료" 활용신청이 승인(처리상태 "승인")됐는지, 붙여 넣은 키에 빠진 글자가 없는지 확인하세요. 활용신청 직후라면 몇 분 뒤 다시 시도하세요.';
    else if (/LIMITED_NUMBER/.test(msg)) msg += '\n오늘 호출 한도(개발계정 하루 10,000건)를 넘었습니다. 내일 다시 받거나, 공공데이터포털에서 운영계정으로 전환 신청하세요.';
    out.textContent = msg;
    await checkKey();
  }
}
async function cacheInfo() {
  const ks = await DB.keys().then(ks => ks.map(String));
  const tr = ks.filter(k => k.startsWith('trade_')).length, rl = ks.filter(k => k.startsWith('kb_rl_')).length, kb = ks.filter(k => k.startsWith('kb_') && !k.startsWith('kb_rl_')).length;
  $('#cacheInfo').textContent = '실거래 ' + tr + '개월분, KB 단지 목록 ' + rl + '개 지역, KB 단지·시세 ' + kb + '건 저장됨';
}

/* ---------- 지역 자료 ---------- */
function seedRows(cxKey) {
  const i = KEYS.indexOf(cxKey); const out = [];
  for (const s of S.seed.series) if (s.cx === cxKey) for (const [d, p, f, a] of s.rows) out.push({ d, ym: Math.floor(d / 100), p, f, a, cancel: false, direct: false, nm: S.seed.complexes[i].name, dong: S.seed.complexes[i].dong, by: S.seed.complexes[i].built, lawd: S.seed.complexes[i].lawd });
  return out;
}
function newRegion(lawd) {
  const r = { lawd, name: regionName(lawd), months: {}, loadedAll: false, complexes: {}, index: null, seedKeys: [], kbList: null, kbListErr: null };
  for (const c of S.seed.complexes) if (c.lawd === lawd) {
    const key = c.name + '|' + c.dong;
    r.complexes[key] = { key, name: c.name, dong: c.dong, by: c.built, rows: seedRows(c.key), seed: c, kbid: c.kbid, hh: c.hh, lawd };
    r.seedKeys.push(key);
  }
  const regName = lawd === '41465' ? '수지구' : lawd === '41220' ? '평택시' : null;
  if (regName && S.seed.index[regName]) { const ix = S.seed.index[regName]; r.index = { v: padIndex(ix.v), booms: ix.booms, busts: ix.busts, meta: ix.meta, source: 'seed' }; r.seedIndexName = regName; }
  return r;
}
function padIndex(v) { const out = new Array(A.MONTHS.length).fill(null); for (let i = 0; i < Math.min(v.length, out.length); i++) out[i] = v[i]; return out; }
function mergeRows(region, rows) {
  for (const r of rows) {
    const key = r.nm + '|' + r.dong;
    let c = region.complexes[key];
    if (!c) { c = region.complexes[key] = { key, name: r.nm, dong: r.dong, by: r.by, rows: [], lawd: region.lawd }; linkOne(region, c); }
    if (!c.rows.length || !c._set) { c._set = new Set(c.rows.map(x => x.d + '|' + x.p + '|' + x.f + '|' + x.a)); }
    const k = r.d + '|' + r.p + '|' + r.f + '|' + r.a;
    if (c._set.has(k)) continue;
    c._set.add(k); c.rows.push(r); c.dirty = true;
  }
}
/* KB 단지 목록과 국토부 실거래 단지를 이름·동으로 짝짓기 */
function kbMatchFor(region, c) {
  if (!region.kbList) return null;
  const n = norm(c.name);
  const same = region.kbList.filter(x => x.dong === c.dong || !c.dong);
  return same.find(x => norm(x.name) === n) || same.find(x => norm(x.name).includes(n) || n.includes(norm(x.name))) || null;
}
function linkOne(region, c) {
  if (c.kbid) return;
  const x = kbMatchFor(region, c); if (!x) return;
  c.kbid = x.id; c.hh = c.hh || x.hh; c.kbInfo = x;
  // 같은 KB 단지로 미리 만들어 둔 'KB만' 항목이 있으면 치움
  for (const k in region.complexes) { const o = region.complexes[k]; if (o !== c && o.kbOnly && o.kbid === x.id) delete region.complexes[k]; }
}
function linkKb(region) {
  if (!region.kbList) return;
  const used = new Set();
  for (const k in region.complexes) { const c = region.complexes[k]; if (c.kbOnly) continue; linkOne(region, c); if (c.kbid) used.add(c.kbid); }
  for (const x of region.kbList) {
    if (used.has(x.id)) continue;
    const key = x.name + '|' + x.dong;
    if (region.complexes[key] && !region.complexes[key].kbOnly) continue;
    if (!region.complexes[key]) region.complexes[key] = { key, name: x.name, dong: x.dong, by: x.movein ? +String(x.movein).slice(0, 4) : null, rows: [], lawd: region.lawd, kbid: x.id, hh: x.hh, kbOnly: true, kbInfo: x };
  }
}
async function ensureKbList(r, onProgress) {
  if (r.kbList || S.kbOk === false) return;
  const full = regionFullName(r.lawd); if (!full) return;
  try { r.kbList = await KB.regionList(r.lawd, full, onProgress); r.kbListErr = null; linkKb(r); }
  catch (e) { r.kbListErr = e.message; }
}
async function getRegion(lawd) {
  if (S.regionsCache[lawd]) return S.regionsCache[lawd];
  const r = newRegion(lawd); S.regionsCache[lawd] = r;
  // 저장된 월 자료가 있으면 먼저 합치기(네트워크 없이)
  const ks = await DB.keys(); const have = ks.filter(k => String(k).startsWith('trade_' + lawd + '_')).map(k => +String(k).split('_')[2]);
  for (const ym of have) { const c = await DB.get('trade_' + lawd + '_' + ym); if (c) { r.months[ym] = c.rows; mergeRows(r, c.rows); } }
  const all = A.MONTHS.filter(m => m >= 200601); if (all.every(m => r.months[m])) r.loadedAll = true;
  return r;
}
async function selectRegion(lawd, silent) {
  S.lawd = lawd; S.sido = lawd.slice(0, 2);
  if ($('#selSido').value !== S.sido) { $('#selSido').value = S.sido; fillSgg(); }
  $('#selSgg').value = lawd; saveState();
  const r = await getRegion(lawd); S.region = r;
  renderRegionHint();
  if (RT.key() && S.keyOk !== false) {
    const want = A.MONTHS.slice(-24).filter(m => !r.months[m] || m >= A.addMonths(A.nowYm(), -2));
    if (want.length) await loadMonths(r, want, '최근 24개월 실거래');
  }
  renderRegionHint();
  if (!r.kbList) {
    const hint = $('#regionHint'); const base = hint.textContent;
    await ensureKbList(r, (done, total) => { if (S.region === r) hint.textContent = base + ' · KB 단지 목록 받는 중 ' + Math.min(done, total) + '/' + total; });
  }
  renderRegionHint(); if (S.sug.open) renderSug();
  if (!silent) renderAll();
}
async function loadMonths(r, yms, label, opt) {
  const lb = $('#loadbar'); lb.hidden = false; const bar = lb.querySelector('i'), txt = lb.querySelector('span');
  txt.textContent = label + ' 받는 중…';
  try {
    const res = await RT.months(r.lawd, yms, (done, total, ym) => { bar.style.width = Math.round(done / total * 100) + '%'; txt.textContent = label + ' ' + done + '/' + total + ' (' + A.ymk(ym) + ')'; }, opt);
    for (const ym in res.out) { r.months[ym] = res.out[ym]; mergeRows(r, res.out[ym]); }
    if (res.errors.length) txt.textContent = label + ' 중 ' + res.errors.length + '개월 실패: ' + res.errors[0].e.message; else lb.hidden = true;
    const all = A.MONTHS.filter(m => m >= 200601); if (all.every(m => r.months[m])) r.loadedAll = true;
  } catch (e) { txt.textContent = '받지 못했습니다: ' + e.message; bar.style.width = '0'; }
}
async function loadRegionAll(lawd) {
  if (!RT.key()) { showTab('settings'); return; }
  const r = await getRegion(lawd);
  const want = A.MONTHS.filter(m => !r.months[m] || m >= A.addMonths(A.nowYm(), -2));
  await loadMonths(r, want, regionName(lawd) + ' 2006년부터 전체 실거래');
  if (r.loadedAll) {
    const rowsAll = []; for (const ym in r.months) for (const x of r.months[ym]) rowsAll.push(x);
    const fe = A.feIndex(rowsAll, 202201);
    if (fe) { const ph = A.phases(fe.Sm); r.index = { v: fe.Sm, booms: ph.booms, busts: ph.busts, meta: '단지·평형 ' + fe.nSer + '개, 거래 ' + fe.nTr.toLocaleString() + '건', source: 'live' }; }
  }
  for (const l of [...new Set(S.cols.map(c => c.lawd))]) ensureBoss(l);
  renderRegionHint(); renderAll();
}
function renderRegionHint() {
  const r = S.region; if (!r) return;
  const cs = Object.values(r.complexes); const nTr = cs.filter(c => c.rows.length).length; const nKb = r.kbList ? r.kbList.length : 0; const loaded = Object.keys(r.months).length;
  let t = regionName(r.lawd) + ': ';
  const parts = [];
  if (nKb) parts.push('KB 단지 목록 ' + nKb + '곳'); else if (r.kbListErr) parts.push('KB 단지 목록 못 받음');
  if (r.loadedAll) parts.push('실거래 단지 ' + nTr + '곳, 2006년부터 전체 실거래 있음 (' + loaded + '개월)');
  else if (loaded) parts.push('실거래 단지 ' + nTr + '곳, 최근 ' + loaded + '개월 실거래' + (r.seedKeys.length ? ' (미리 담아 둔 ' + r.seedKeys.length + '곳은 2006년부터 전체)' : '') + ' — 역대 최고가와 지역 지수는 전체를 불러와야 정확합니다');
  else if (r.seedKeys.length) parts.push('실거래는 미리 담아 둔 ' + r.seedKeys.length + '곳만 2006년부터 전체' + (RT.key() ? '' : ' — 다른 단지의 실거래는 설정에서 인증키를 넣어야 들어옵니다'));
  else parts.push(RT.key() ? '실거래를 아직 받지 못했습니다' : '실거래는 설정에서 인증키를 넣으면 들어옵니다 (KB시세·방문 수는 키 없이도 나옴)');
  $('#regionHint').textContent = t + parts.join(' · ');
  $('#btnLoadAll').disabled = !RT.key() || r.loadedAll;
  $('#btnLoadAll').textContent = r.loadedAll ? '전체 실거래 받음' : '2006년부터 전체 불러오기';
}

/* ---------- 단지 이름 추천 ---------- */
function localMatches(text) {
  const r = S.region; if (!r) return [];
  const n = norm(text);
  let list = Object.values(r.complexes);
  if (n) list = list.filter(c => norm(c.name).includes(n) || norm(c.dong).includes(n));
  list.sort((a, b) => (b.rows.length - a.rows.length) || ((b.hh || 0) - (a.hh || 0)) || a.name.localeCompare(b.name, 'ko'));
  return list.slice(0, n ? 8 : 12);
}
let remoteTimer = null;
function fetchRemote() {
  const text = $('#inpCx').value.trim();
  clearTimeout(remoteTimer);
  if (text.length < 2 || S.kbOk === false) { S.sug.remote = []; S.sug.remoteFor = text; return; }
  remoteTimer = setTimeout(async () => {
    try { const list = await KB.suggest(text, 8); if ($('#inpCx').value.trim() === text) { S.sug.remote = list; S.sug.remoteFor = text; renderSug(); } }
    catch (e) { S.sug.remote = []; S.sug.remoteFor = text; }
  }, 300);
}
function renderSug() {
  const box = $('#cxSug'); const text = $('#inpCx').value.trim(); const r = S.region;
  const items = [];
  const loc = localMatches(text);
  for (const c of loc) items.push({ kind: 'local', c });
  const locIds = new Set(loc.map(c => c.kbid).filter(Boolean));
  if (S.sug.remoteFor === text) for (const x of S.sug.remote) if (!(x.lawd === S.lawd && locIds.has(x.id))) items.push({ kind: 'remote', x });
  S.sug.items = items; S.sug.open = true;
  let h = '';
  if (loc.length) {
    h += '<div class="sh">' + esc(regionName(S.lawd)) + (text ? '' : ' — 거래 많은 순') + '</div>';
    loc.forEach((c, i) => { const n = A.valid(c.rows).length; h += '<button type="button" class="si" data-i="' + i + '"><b>' + esc(c.name) + '</b><small>' + esc(c.dong) + (c.hh ? ' · ' + Number(c.hh).toLocaleString() + '세대' : '') + (c.by ? ' · ' + c.by + '년' : '') + ' · ' + (n ? '실거래 ' + n.toLocaleString() + '건' + (c.seed || (r && r.loadedAll) ? ' (2006년부터)' : '') : (c.kbOnly ? '실거래 자료 없음 (KB 자료만)' : '실거래 없음')) + '</small></button>'; });
  }
  const rem = items.filter(it => it.kind === 'remote');
  if (rem.length) {
    h += '<div class="sh">다른 지역 (KB부동산 전국 검색)</div>';
    rem.forEach(it => { const i = items.indexOf(it); const x = it.x; h += '<button type="button" class="si" data-i="' + i + '"><b>' + esc(x.name) + '</b><small>' + esc(x.addr) + (x.hh ? ' · ' + Number(x.hh).toLocaleString() + '세대' : '') + (x.movein ? ' · 입주 ' + String(x.movein).slice(0, 4) + '년 ' + (+String(x.movein).slice(4, 6)) + '월' : '') + ' · ' + esc(x.kind) + '</small></button>'; });
  }
  if (!items.length) {
    if (text.length >= 2 && S.sug.remoteFor !== text) h += '<div class="se"><span class="spin"></span> 전국에서 찾는 중…</div>';
    else if (text) h += '<div class="se">"' + esc(text) + '"에 맞는 단지를 찾지 못했습니다. 띄어쓰기 없이 전체 이름으로 적어 보세요.</div>';
    else if (r && !r.kbList && S.kbOk !== false) h += '<div class="se"><span class="spin"></span> ' + esc(regionName(S.lawd)) + ' 단지 목록을 KB부동산에서 받는 중…</div>';
    else h += '<div class="se">단지 이름을 입력하세요.</div>';
  }
  box.innerHTML = h; box.hidden = false;
  box.querySelectorAll('.si').forEach(b => b.addEventListener('click', () => pickSug(+b.dataset.i)));
  paintSug();
}
function paintSug() { $('#cxSug').querySelectorAll('.si').forEach(b => b.classList.toggle('on', +b.dataset.i === S.sug.on)); }
function closeSug() { $('#cxSug').hidden = true; S.sug.open = false; S.sug.on = -1; }
async function pickSug(i) {
  const it = S.sug.items[i]; if (!it) return;
  closeSug(); $('#inpCx').value = '';
  if (it.kind === 'local') { await addColumn(S.lawd, it.c.key, null); renderAll(); return; }
  await addRemote(it.x);
}
async function addRemote(x) {
  if (!hasRegion(x.lawd)) { alert(x.addr + '의 시·군·구 코드(' + x.lawd + ')가 지역 목록에 없어 넣지 못했습니다.'); return; }
  if (x.lawd !== S.lawd) await selectRegion(x.lawd, true);
  const r = S.region; await ensureKbList(r);
  let c = Object.values(r.complexes).find(c => c.kbid === x.id);
  if (!c) { const key = x.name + '|' + x.dong; c = r.complexes[key] = r.complexes[key] || { key, name: x.name, dong: x.dong, by: x.movein ? +String(x.movein).slice(0, 4) : null, rows: [], lawd: r.lawd, kbid: x.id, hh: x.hh, kbOnly: true, kbInfo: x }; }
  await addColumn(r.lawd, c.key, null); renderAll();
}
function findComplex(text) {
  const r = S.region; const t = text.trim(); if (!t) return null;
  const m = t.match(/^(.*?)\s*\((.+?)\)\s*$/);
  if (m) { const key = m[1].trim() + '|' + m[2].trim(); if (r.complexes[key]) return r.complexes[key]; }
  const n = norm(t);
  const cands = Object.values(r.complexes).filter(c => norm(c.name) === n);
  if (cands.length) return cands.sort((a, b) => b.rows.length - a.rows.length)[0];
  const part = Object.values(r.complexes).filter(c => norm(c.name).includes(n));
  return part.sort((a, b) => b.rows.length - a.rows.length)[0] || null;
}

/* ---------- 비교 열 ---------- */
function groupsOf(c, types) {
  const g = {};
  for (const r of A.valid(c.rows)) { const k = A.groupOf(r.a); (g[k] = g[k] || []).push(r); }
  const out = Object.keys(g).map(Number).map(k => ({ g: k, rows: g[k], n: g[k].length }));
  for (const t of (types || [])) { const k = Math.floor(t.exc); if (!isNaN(k) && !out.find(x => x.g === k)) out.push({ g: k, rows: [], n: 0, kbOnly: true }); }
  return out.sort((a, b) => a.g - b.g);
}
function defaultGroup(c, prefer, types) {
  const gs = groupsOf(c, types); if (!gs.length) return null;
  if (prefer != null) { const x = gs.find(x => x.g === prefer); if (x) return x.g; }
  const near84 = gs.filter(x => x.g >= 82 && x.g <= 85).sort((a, b) => b.n - a.n)[0];
  if (near84) return near84.g;
  const traded = gs.filter(x => x.n).sort((a, b) => b.n - a.n)[0]; if (traded) return traded.g;
  const hh = (types || []).slice().sort((a, b) => b.hh - a.hh)[0]; return hh ? Math.floor(hh.exc) : gs[0].g;
}
async function onAdd() {
  if (S.sug.open && S.sug.on >= 0 && S.sug.items[S.sug.on]) { await pickSug(S.sug.on); return; }
  const text = $('#inpCx').value;
  const c = findComplex(text);
  if (c) { closeSug(); await addColumn(S.lawd, c.key, null); $('#inpCx').value = ''; renderAll(); return; }
  if (S.sug.remoteFor === text.trim() && S.sug.remote.length) { closeSug(); $('#inpCx').value = ''; await addRemote(S.sug.remote[0]); return; }
  if (text.trim().length >= 2 && S.kbOk !== false) {
    try { const list = await KB.suggest(text.trim(), 5); if (list.length) { closeSug(); $('#inpCx').value = ''; await addRemote(list[0]); return; } } catch (e) { }
  }
  alert('그 이름의 단지를 찾지 못했습니다. 띄어쓰기 없이 전체 이름으로 적거나, 아래 추천 목록에서 고르세요.');
}
function ensureBoss(lawd) {
  const r = S.regionsCache[lawd]; if (!r) return null;
  const bosses = A.pickBoss(Object.values(r.complexes));
  const boss = bosses[0] ? bosses[0].c : null;
  const cur = S.cols.find(x => x.lawd === lawd && x.role === 'boss');
  if (!boss) return cur || null;
  if (cur && cur.key === boss.key) { cur.bossInfo = bosses[0]; cur.bossList = bosses.slice(0, 5); return cur; }
  if (cur) S.cols = S.cols.filter(x => x !== cur);
  const bc = { id: 'b' + lawd, lawd, key: boss.key, c: boss, role: 'boss', g: defaultGroup(boss, 84), bossInfo: bosses[0], bossList: bosses.slice(0, 5) };
  S.cols.push(bc); orderCols(); enrichKb(bc);
  return bc;
}
async function addColumn(lawd, key, g, silent) {
  const r = await getRegion(lawd); let c = r.complexes[key];
  if (!c) { await ensureKbList(r); c = r.complexes[key]; }
  if (!c) { if (!silent) alert('단지를 찾지 못했습니다: ' + key.split('|')[0]); return; }
  if (S.cols.find(x => x.lawd === lawd && x.key === key && x.role !== 'boss')) { if (!silent) alert('이미 비교에 있는 단지입니다.'); return; }
  // 대장 열(지역마다 하나)
  const b = ensureBoss(lawd);
  if (b && b.key === key) { if (g != null) b.g = g; saveState(); return; }
  const col = { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), lawd, key, c, role: 'target', g: g != null ? g : defaultGroup(c, null) };
  S.cols.push(col); orderCols(); saveState(); enrichKb(col);
  if (!silent) renderAll();
}
function orderCols() {
  const regs = []; for (const c of S.cols) if (!regs.includes(c.lawd)) regs.push(c.lawd);
  const out = [];
  for (const l of regs) { const b = S.cols.find(c => c.lawd === l && c.role === 'boss'); if (b) out.push(b); for (const c of S.cols) if (c.lawd === l && c.role !== 'boss') out.push(c); }
  S.cols = out;
}
function removeColumn(id) {
  const col = S.cols.find(c => c.id === id); if (!col) return;
  S.cols = S.cols.filter(c => c.id !== id);
  if (!S.cols.find(c => c.lawd === col.lawd && c.role !== 'boss')) S.cols = S.cols.filter(c => !(c.lawd === col.lawd && c.role === 'boss'));
  saveState(); renderAll();
}
async function enrichKb(col, force) {
  if (S.kbOk === false) return;
  col.kb = { loading: true };
  try {
    let id = col.c.kbid;
    if (!id) { const m = await KB.match(col.c.name, col.lawd); if (m.best) { id = m.best.id; col.c.kbid = id; col.kbCand = m.list; } }
    if (!id) { col.kb = { none: true }; renderAll(); return; }
    const cx = await KB.complex(id, force); col.kb = { id, cx, types: cx.types };
    if (col.g == null) { col.g = defaultGroup(col.c, null, cx.types); saveState(); }
    await loadKbPrice(col, force);
  } catch (e) { col.kb = { error: e.message }; }
  renderAll();
}
async function loadKbPrice(col, force) {
  if (!col.kb || !col.kb.cx) return;
  const ts = col.kb.types.filter(t => Math.floor(t.exc) === col.g);
  if (!ts.length) { col.kb.price = null; col.kb.chart = null; col.kb.rep = null; return; }
  const rep = ts.slice().sort((a, b) => b.hh - a.hh)[0];
  col.kb.rep = rep; col.kb.groupHh = ts.reduce((s, t) => s + t.hh, 0); col.kb.groupTypes = ts;
  try { col.kb.price = await KB.price(col.kb.id, rep.aid, force); col.kb.chart = await KB.chart(col.kb.id, rep.aid, force); col.kb.askN = ts.reduce((s, t) => s + (t.lst ? t.lst[0] : 0), 0); } catch (e) { col.kb.price = null; col.kb.chart = null; }
}
async function setGroup(id, g) {
  const col = S.cols.find(c => c.id === id); if (!col) return; col.g = g; saveState(); renderAll();
  if (col.kb && col.kb.cx) { await loadKbPrice(col); renderAll(); }
}
/* 실거래가·조회수 한 번에 가져오기: 비교에 있는 지역의 최근 3개월 실거래를 다시 받고, KB 방문 수·시세·호가를 지금 기준으로 새로 받음 */
async function refreshAll() {
  const btn = $('#btnRefresh'); const info = $('#refreshInfo');
  if (!S.cols.length) { alert('먼저 비교에 단지를 넣으세요.'); return; }
  btn.disabled = true; info.innerHTML = '<span class="spin"></span> 새로 받는 중…';
  const regs = [...new Set(S.cols.map(c => c.lawd))]; let nMon = 0;
  try {
    if (RT.key() && S.keyOk !== false) {
      const yms = [A.addMonths(A.nowYm(), -2), A.addMonths(A.nowYm(), -1), A.nowYm()];
      for (const l of regs) { const r = await getRegion(l); await loadMonths(r, yms, regionName(l) + ' 최근 3개월 실거래', { force: true }); nMon += yms.length; ensureBoss(l); }
    }
    let nKb = 0;
    for (const col of S.cols) { if (col.kb && col.kb.id) { col.kb.cx = await KB.complex(col.kb.id, true); col.kb.types = col.kb.cx.types; await loadKbPrice(col, true); nKb++; } else if (!col.kb || col.kb.none || col.kb.error) await enrichKb(col, true); }
    S.lastRefresh = Date.now();
    info.textContent = ymdhm(S.lastRefresh) + ' 기준으로 새로 받았습니다 — ' + (nMon ? '실거래 ' + regs.length + '개 지역 최근 3개월, ' : '실거래는 인증키가 없어 건너뜀, ') + 'KB 방문 수·시세·호가 ' + nKb + '개 단지.';
  } catch (e) { info.textContent = '새로 받는 중 문제가 있었습니다: ' + e.message; }
  btn.disabled = false; renderAll();
}
async function refreshKbOnly() {
  for (const col of S.cols) { if (col.kb && col.kb.id) { try { col.kb.cx = await KB.complex(col.kb.id, true); } catch (e) { } } }
  renderAll();
}
function colLabel(col) {
  if (col.g == null) return '평형 고르는 중';
  if (col.kb && col.kb.rep) return A.labelFor(col.g, col.kb.rep.sup);
  if (col.c.seed) { const t = col.c.seed.types.filter(t => Math.floor(t.exc) === col.g).sort((a, b) => b.hh - a.hh)[0]; if (t) return A.labelFor(col.g, t.sup); }
  return A.labelFor(col.g);
}
function colStats(col) {
  if (!col._stats || col._stats.g !== col.g || col.c.dirty) {
    const rows = col.g == null ? [] : col.c.rows.filter(r => A.groupOf(r.a) === col.g);
    col._stats = { g: col.g, rows, ext: A.extremes(rows), cyc: A.cycle(rows), mon: A.monthly(rows) }; col.c.dirty = false;
  }
  return col._stats;
}
function curPrice(col) {
  const p = col.kb && col.kb.price;
  if (p && p.s_mid) return { v: p.s_mid, src: 'KB시세' };
  const e = colStats(col).ext; if (e && e.rec3.length) return { v: e.rec3med, src: '최근 3개월 실거래 중간값' };
  if (e && e.rec12.length) return { v: e.rec12med, src: '최근 12개월 실거래 중간값' };
  return null;
}
function roleName(col) { return col.role === 'boss' ? '대장' : '선택'; }
function colClass(col) { return col.role === 'boss' ? 'boss' : 'pick'; }
function regionColor(lawd) { const ls = [...new Set(S.cols.map(c => c.lawd))]; return ROLE_COLORS[ls.indexOf(lawd) % ROLE_COLORS.length]; }
function isFull(col) { return !!(col.c.seed || (S.regionsCache[col.lawd] && S.regionsCache[col.lawd].loadedAll)); }
function kbViewHtml(col, long) {
  const cx = col.kb && col.kb.cx; if (!cx) return '';
  return 'KB 방문 <b>' + Number(cx.view || 0).toLocaleString() + '</b>명<small>' + hm(cx.at || Date.now()) + ' 기준</small>' + (long ? ' · 관심 ' + Number(cx.fav || 0).toLocaleString() + '명 · 매매 매물 ' + Number(cx.listings[0] || 0).toLocaleString() + '건' : '');
}

/* ---------- 그리기 ---------- */
function renderAll() { renderCols(); renderCompare(); if (S.tab === 'cycle') renderCycle(); if (S.tab === 'data') renderMonthly(); }
function renderCols() {
  const box = $('#cols'); box.innerHTML = '';
  $('#emptyCompare').style.display = S.cols.length ? 'none' : 'block';
  for (const col of S.cols) {
    const c = col.c; const gs = groupsOf(c, col.kb && col.kb.types);
    const card = el('div', { class: 'card ' + colClass(col) });
    const full = isFull(col);
    let meta = regionName(col.lawd) + ' ' + c.dong + (c.by ? ' · ' + c.by + '년 준공' : '');
    if (col.kb && col.kb.cx) meta += ' · ' + Number(col.kb.cx.hh).toLocaleString() + '세대 · ' + col.kb.cx.kind + (col.kb.cx.hall ? ' · ' + col.kb.cx.hall : '');
    else if (c.seed) meta += ' · ' + c.seed.hh.toLocaleString() + '세대 · ' + c.seed.kind;
    else if (c.hh) meta += ' · ' + Number(c.hh).toLocaleString() + '세대';
    card.innerHTML = '<div class="role">' + roleName(col) + (col.role === 'boss' ? ' <small>(전용 84㎡ 최근 12개월 중간값 ' + A.won(col.bossInfo.med) + ', ' + col.bossInfo.n + '건)</small>' : '') + '</div><div class="name">' + esc(c.name) + '</div><div class="meta">' + esc(meta) + (c.rows.length && !full ? ' · <span class="up">최근 24개월 자료만</span>' : '') + '</div>';
    const chips = el('div', { class: 'chips' });
    for (const x of gs) {
      const t = (col.kb && col.kb.types) ? col.kb.types.filter(t => Math.floor(t.exc) === x.g).sort((a, b) => b.hh - a.hh)[0] : (c.seed ? c.seed.types.filter(t => Math.floor(t.exc) === x.g).sort((a, b) => b.hh - a.hh)[0] : null);
      const lab = A.labelFor(x.g, t ? t.sup : null);
      chips.appendChild(el('button', { class: 'chip' + (x.g === col.g ? ' on' : ''), onclick: () => setGroup(col.id, x.g) }, esc(lab) + ' <small>' + (x.n ? x.n + '건' : 'KB만') + '</small>'));
    }
    card.appendChild(chips);
    if (col.kb && col.kb.loading) card.appendChild(el('div', { class: 'kbline' }, '<span class="spin"></span> KB부동산에서 세대수·시세·방문 수 받는 중'));
    else if (col.kb && col.kb.cx) { card.appendChild(el('div', { class: 'kbview' }, kbViewHtml(col, true))); if (col.kb.cx.reg && col.kb.cx.reg.length) card.appendChild(el('div', { class: 'kbline' }, esc(col.kb.cx.reg.join(', ')))); }
    else if (col.kb && (col.kb.none || col.kb.error)) card.appendChild(el('div', { class: 'kbline' }, 'KB부동산에서 같은 이름의 단지를 찾지 못했습니다. 실거래 기준으로만 보여 줍니다.'));
    if (!c.rows.length) card.appendChild(el('div', { class: 'kbline up' }, RT.key() ? '국토교통부 실거래에 이 이름의 거래가 없습니다(최근 24개월 거래 없음 또는 이름이 다름). KB 자료만 보여 줍니다.' : '실거래 자료 없음 — 설정에서 인증키를 넣으면 들어옵니다. 지금은 KB 자료만 보여 줍니다.'));
    if (col.role === 'boss' && col.bossList && col.bossList.length > 1) card.appendChild(el('div', { class: 'kbline' }, '다음 순위: ' + col.bossList.slice(1, 4).map(b => esc(b.c.name) + ' ' + A.won(b.med)).join(', ')));
    if (col.role !== 'boss') card.appendChild(el('button', { class: 'x', title: '비교에서 빼기', onclick: () => removeColumn(col.id) }, '×'));
    box.appendChild(card);
  }
  // 대장이 없는 지역 안내
  for (const l of [...new Set(S.cols.map(c => c.lawd))]) if (!S.cols.find(c => c.lawd === l && c.role === 'boss')) {
    const r = S.regionsCache[l];
    box.appendChild(el('div', { class: 'card' }, '<div class="role">대장 (' + esc(regionName(l)) + ')</div><div class="meta">' + (r && Object.values(r.complexes).some(c => c.rows.length) ? '전용 82~86㎡ 최근 12개월 거래 10건 이상인 단지가 없어 대장을 정하지 못했습니다.' : '대장은 실거래로 정합니다 — ' + (RT.key() ? '이 지역 실거래를 받으면 정해집니다.' : '설정에서 인증키를 넣으면 이 지역 실거래가 들어오고 대장이 정해집니다.')) + '</div>'));
  }
}
function cell(main, sub, cls) { return '<td class="' + (cls || '') + '">' + (main == null || main === '' ? '<span class="na">-</span>' : '<span class="big">' + main + '</span>') + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</td>'; }
function tdText(t, cls) { return '<td class="' + (cls || '') + '">' + (t == null || t === '' ? '<span class="na">-</span>' : t) + '</td>'; }
function renderCompare() {
  const box = $('#compareTable');
  if (!S.cols.length) { box.innerHTML = ''; return; }
  const cols = S.cols; const st = cols.map(colStats);
  let h = '<table><thead><tr><th>항목</th>' + cols.map(c => '<th class="' + colClass(c) + '">' + esc(c.c.name) + '<span class="sub">' + esc(colLabel(c)) + ' · ' + roleName(c) + '</span></th>').join('') + '</tr></thead><tbody>';
  const grp = t => '<tr class="grp"><td colspan="' + (cols.length + 1) + '">' + t + '</td></tr>';
  const row = (label, fn) => '<tr><td>' + label + '</td>' + cols.map((c, i) => fn(c, st[i]) || tdText('')).join('') + '</tr>';
  // 현재 가격(KB)
  h += grp('현재 (KB부동산, 받은 시각 기준)');
  h += row('KB 방문 수 (조회수)', c => { const cx = c.kb && c.kb.cx; return cx ? cell(Number(cx.view || 0).toLocaleString() + '명', hm(cx.at || Date.now()) + ' 기준 · 관심 ' + Number(cx.fav || 0).toLocaleString() + '명') : (c.kb && c.kb.loading ? tdText('<span class="spin"></span>') : tdText('')); });
  h += row('KB 매물 (매매 · 전세 · 월세)', c => { const cx = c.kb && c.kb.cx; return cx ? cell(Number(cx.listings[0] || 0).toLocaleString() + '건', '전세 ' + Number(cx.listings[1] || 0) + '건 · 월세 ' + Number(cx.listings[2] || 0) + '건') : tdText(''); });
  h += row('매매 KB시세 (일반가)', c => { const p = c.kb && c.kb.price; return p && p.s_mid ? cell(A.won(p.s_mid), '하위 ' + A.won(p.s_lo) + ' ~ 상위 ' + A.won(p.s_hi) + ' · ' + String(p.base || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3 기준')) : (c.kb && c.kb.loading ? tdText('<span class="spin"></span>') : tdText('')); });
  h += row('호가 (KB 매물 최저 ~ 최고)', c => { const ch = c.kb && c.kb.chart; return ch && ch.ask[0] ? cell(A.won(ch.ask[0]) + ' ~ ' + A.won(ch.ask[1]), (c.kb.price && c.kb.price.ask_avg ? '평균 ' + A.won(c.kb.price.ask_avg) + ' · ' : '') + '이 평형 매물 ' + (c.kb.askN || 0) + '건') : tdText(ch ? '매물 없음' : ''); });
  h += row('전세 KB시세 (일반가)', c => { const p = c.kb && c.kb.price; return p && p.j_mid ? cell(A.won(p.j_mid), (c.kb.chart && c.kb.chart.ask[2] ? '전세 매물 ' + A.won(c.kb.chart.ask[2]) + ' ~ ' + A.won(c.kb.chart.ask[3]) + ' · ' : '') + '전세가율 ' + (p.j_mid / p.s_mid * 100).toFixed(1) + '%') : tdText(''); });
  h += row('매매 − 전세 (갭)', c => { const p = c.kb && c.kb.price; return p && p.s_mid && p.j_mid ? cell(A.won(p.s_mid - p.j_mid)) : tdText(''); });
  // 실거래
  h += grp('실거래가 (국토교통부)');
  h += row('역대 최고 실거래가', (c, s) => { const e = s.ext; if (!e) return tdText(''); const ms = [...new Set(e.maxs.map(r => r.ym))]; return cell(A.won(e.max.p), ms.map(A.ymk).join(' / ') + ' (' + e.maxs.map(r => r.f + '층').join('·') + ')' + (isFull(c) ? '' : ' · 최근 24개월 안'), 'up'); });
  h += row('저점 (2022년 이후)', (c, s) => { const e = s.ext; return e && e.lo22 ? cell(A.won(e.lo22.p), A.dk(e.lo22.d, e.lo22.f), 'down') : tdText(''); });
  h += row('참고 저점 (4층 이상, 이상 저가 제외)', (c, s) => { const e = s.ext; return e && e.lo22b ? cell(A.won(e.lo22b.p), A.dk(e.lo22b.d, e.lo22b.f)) : tdText(''); });
  h += row('전고점 (2020~2022년 최고 거래)', (c, s) => { const e = s.ext; return e && e.pk2022 ? cell(A.won(e.pk2022.p), e.pk2022s.map(r => A.dk(r.d, r.f)).join(' / ')) : tdText(e ? '<span class="na">2020~2022년 거래 없음</span>' : ''); });
  h += row('최근 실거래', (c, s) => { const e = s.ext; return e ? cell(A.won(e.last.p), A.dk(e.last.d, e.last.f)) : tdText(''); });
  h += row('최근 3개월 중간값 (건수)', (c, s) => { const e = s.ext; return e && e.rec3.length ? cell(A.won(e.rec3med), e.rec3.length + '건') : tdText(e ? '거래 없음' : ''); });
  h += row('최근 12개월 중간값 (건수)', (c, s) => { const e = s.ext; return e && e.rec12.length ? cell(A.won(e.rec12med), e.rec12.length + '건') : tdText(e ? '거래 없음' : ''); });
  h += row('거래 건수 (불러온 기간)', (c, s) => { const e = s.ext; return e ? cell(e.n + '건', A.ymk(Math.floor(e.first / 100)) + '부터') : tdText(''); });
  // 틀의 계산 항목
  h += grp('틀의 계산 항목 (매매 = KB시세 일반가, 없으면 최근 실거래 중간값)');
  h += row('매매 (계산에 쓴 현재가)', c => { const cp = curPrice(c); return cp ? cell(A.won(cp.v), cp.src) : tdText(''); });
  h += row('최대 하락률 (전고점 → 저점)', (c, s) => { const e = s.ext; return e && e.pk2022 && e.lo22 ? cell(A.pct(e.lo22.p / e.pk2022.p - 1), null, 'down') : tdText(''); });
  h += row('상승률 (저점 → 매매)', (c, s) => { const e = s.ext; const cp = curPrice(c); return e && e.lo22 && cp ? cell(A.pct(cp.v / e.lo22.p - 1), null, 'up') : tdText(''); });
  h += row('하락률 (역대 최고 → 매매)', (c, s) => { const e = s.ext; const cp = curPrice(c); if (!(e && cp)) return tdText(''); const x = cp.v / e.max.p - 1; return cell(A.pct(x), null, x < 0 ? 'down' : 'up'); });
  h += row('기준가 −15% / −20% / −25% (현재가가 더 낮으면 Y)', (c, s) => { const e = s.ext; const cp = curPrice(c); if (!e) return tdText(''); const m = e.max.p; const y = v => cp && cp.v < v ? ' <b class="down">Y</b>' : ''; return tdText(A.won(m * 0.85) + y(m * 0.85) + '<span class="sub">' + A.won(m * 0.8) + y(m * 0.8) + ' / ' + A.won(m * 0.75) + y(m * 0.75) + '</span>'); });
  // 사이클
  h += grp('사이클 (시세 = 최근 3개월 실거래 중간값)');
  h += row('붐 시작 (고점 전 36개월 내 최저)', (c, s) => { const y = s.cyc; return y.pk && y.st ? cell(A.ymk(y.st) + (y.stFirst ? ' (입주 직후)' : ''), A.won(y.sv)) : tdText(''); });
  h += row('고점 (2020~2022년)', (c, s) => { const y = s.cyc; return y.pk ? cell(A.ymk(y.pk), A.won(y.pv) + (y.plateau ? ' · 고점권 ' + A.ymk(y.plateau[0]) + '~' + A.ymk(y.plateau[1]) + ' (' + (A.mdiff(y.plateau[0], y.plateau[1]) + 1) + '개월)' : ''), 'up') : tdText(y.n && y.valid2022 < 3 ? '<span class="na">2020~2022년 거래 3건 미만</span>' : ''); });
  h += row('붐 기간 · 상승률', (c, s) => { const y = s.cyc; return y.pk && y.st ? cell(A.mdiff(y.st, y.pk) + '개월', A.pct(y.pv / y.sv - 1)) : tdText(''); });
  h += row('−10% 진입', (c, s) => { const y = s.cyc; return y.pk ? cell(y.d10 ? A.ymk(y.d10) : '−10% 안 됨', y.d10 ? '고점 후 ' + A.mdiff(y.pk, y.d10) + '개월' : '') : tdText(''); });
  h += row('1차 저점 (~2023년 12월)', (c, s) => { const y = s.cyc; return y.pk && y.t1 ? cell(A.ymk(y.t1), A.won(y.t1v) + ' · 고점 대비 ' + A.pct(y.t1v / y.pv - 1) + ' · ' + A.mdiff(y.pk, y.t1) + '개월', 'down') : tdText(''); });
  h += row('전체 저점 (고점 이후 지금까지)', (c, s) => { const y = s.cyc; return y.pk && y.tr ? cell(A.ymk(y.tr), A.won(y.tv) + ' · ' + A.pct(y.tv / y.pv - 1), 'down') : tdText(''); });
  h += row('고점 회복', (c, s) => { const y = s.cyc; return y.pk && y.t1 ? cell(y.rec ? A.ymk(y.rec) : '미회복', y.rec ? '고점 후 ' + A.mdiff(y.pk, y.rec) + '개월' : '', y.rec ? '' : 'down') : tdText(''); });
  h += row('현재 시세 (마지막 거래 달)', (c, s) => { const y = s.cyc; return y.lv ? cell(A.won(y.lv), A.ymk(y.last) + (y.pk ? ' · 고점 대비 ' + A.pct(y.lv / y.pv - 1) : '')) : tdText(''); });
  // 대장 대비
  const bossOf = c => S.cols.find(x => x.lawd === c.lawd && x.role === 'boss');
  h += row('대장 대비 (KB시세 평당가)', c => { const b = bossOf(c); if (!b || b === c) return tdText(c.role === 'boss' ? '기준' : ''); const p = c.kb && c.kb.price, q = b.kb && b.kb.price; if (!(p && p.s_mid && q && q.s_mid && c.kb.rep && b.kb.rep)) return tdText(''); const r = (p.s_mid / c.kb.rep.sup) / (q.s_mid / b.kb.rep.sup); return cell((r * 100).toFixed(0) + '%', '3.3㎡당 ' + A.won(p.s_mid / A.pyeong(c.kb.rep.sup)) + ' / 대장 ' + A.won(q.s_mid / A.pyeong(b.kb.rep.sup))); });
  h += row('대장 대비 방문 수', c => { const b = bossOf(c); if (!b || b === c) return tdText(c.role === 'boss' ? '기준' : ''); const v = c.kb && c.kb.cx && c.kb.cx.view, w = b.kb && b.kb.cx && b.kb.cx.view; if (v == null || !w) return tdText(''); return cell((v / w * 100).toFixed(0) + '%', '대장 ' + Number(w).toLocaleString() + '명'); });
  h += row('대장 대비 고점 시점', (c, s) => { const b = bossOf(c); if (!b || b === c) return tdText(c.role === 'boss' ? '기준' : ''); const y = s.cyc, z = colStats(b).cyc; if (!(y.pk && z.pk)) return tdText(''); const d = A.mdiff(z.pk, y.pk); return cell(d === 0 ? '같은 달' : d > 0 ? d + '개월 늦음' : (-d) + '개월 먼저', '대장 ' + A.ymk(z.pk), d > 0 ? 'down' : d < 0 ? 'up' : ''); });
  h += row('대장 대비 −10% 진입', (c, s) => { const b = bossOf(c); if (!b || b === c) return tdText(c.role === 'boss' ? '기준' : ''); const y = s.cyc, z = colStats(b).cyc; if (!(y.d10 && z.d10)) return tdText(''); const d = A.mdiff(z.d10, y.d10); return cell(d === 0 ? '같은 달' : d > 0 ? d + '개월 늦음' : (-d) + '개월 먼저', '대장 ' + A.ymk(z.d10)); });
  h += '</tbody></table>';
  box.innerHTML = h;
}

/* ---------- 사이클 탭 ---------- */
function policyType(t) { return t.startsWith('강화') ? 'tight' : t.startsWith('완화') ? 'loose' : t.startsWith('공급') ? 'supply' : 'etc'; }
function bokRate(ym) { let r = 4.25; for (const b of S.seed.bok) { const y = +b.date.slice(0, 4) * 100 + +b.date.slice(5, 7); if (y <= ym) r = b.rate; } return r; }
function pres(ym) { if (ym < 200802) return '노무현'; if (ym < 201302) return '이명박'; if (ym < 201703) return '박근혜'; if (ym < 201705) return '권한대행'; if (ym < 202205) return '문재인'; if (ym < 202504) return '윤석열'; if (ym < 202506) return '권한대행'; return '이재명'; }
function renderLegend() { $('#ddLegend').innerHTML = A.DD.map(([t, c]) => '<span><i style="background:' + c + '"></i>' + t + '</span>').join(''); }
function renderPolList() {
  const ps = S.seed.policies.filter(p => p.date >= '2019');
  $('#polList').innerHTML = '<table><tr><th>번호</th><th>일자</th><th>구분</th><th>통칭</th><th>내용</th></tr>' + ps.map((p, i) => '<tr><td>' + (i + 1) + '</td><td>' + p.date + (p.dk !== '발표' ? '<br><small>' + esc(p.dk) + '</small>' : '') + '</td><td><span class="tag ' + policyType(p.type) + '">' + esc(p.type) + '</span></td><td>' + esc(p.name) + '</td><td>' + esc(p.desc) + '</td></tr>').join('') + '</table>';
}
function renderCycle() {
  const r = S.region; if (!r) return;
  $('#cycleTitle').textContent = regionName(r.lawd) + ' 지역 지수';
  renderIndexChart(r); renderTimeline(); renderCxChart();
}
function renderIndexChart(r) {
  const box = $('#idxStats'); const cv = $('#idxChart');
  if (!r.index) { box.innerHTML = '<p class="note">이 지역의 지수는 2006년부터 전체 실거래를 불러온 뒤 계산됩니다(비교 탭의 "2006년부터 전체 불러오기").</p>'; if (S.charts.idx) { S.charts.idx.destroy(); S.charts.idx = null; } return; }
  const v = r.index.v; const st = A.indexStats(v);
  const labels = A.MONTHS.map(m => Math.floor(m / 100) + '.' + String(m % 100).padStart(2, '0'));
  const data = v.map(x => x == null ? null : Math.round(x * 10) / 10);
  if (S.charts.idx) S.charts.idx.destroy();
  S.charts.idx = new Chart(cv, { type: 'line', data: { labels, datasets: [{ label: regionName(r.lawd) + ' 지수', data, borderColor: '#1B2A41', borderWidth: 2, pointRadius: 0, spanGaps: true, tension: 0 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => A.ymk(A.MONTHS[it[0].dataIndex]), label: it => '지수 ' + it.formattedValue + ' · 기준금리 ' + bokRate(A.MONTHS[it.dataIndex]).toFixed(2) + '% · ' + pres(A.MONTHS[it.dataIndex]) } } }, scales: { x: { ticks: { callback: (val, i) => (A.MONTHS[i] % 100 === 1 && (window.innerWidth >= 700 || Math.floor(A.MONTHS[i] / 100) % 3 === 0) ? Math.floor(A.MONTHS[i] / 100) + '년' : ''), autoSkip: false, maxRotation: 0 } }, y: { title: { display: true, text: '2022년 1월 = 100' } } } } });
  const cyc = st ? [['고점', A.ymk(st.pk) + ' (' + st.pkv.toFixed(1) + ')'], ['−10% 진입', st.d10 ? A.ymk(st.d10) : '-'], ['1차 저점', st.t1 ? A.ymk(st.t1) + ' (' + st.t1v.toFixed(1) + ', ' + A.pct(st.t1v / st.pkv - 1) + ')' : '-'], ['전체 저점', st.tr ? A.ymk(st.tr) + ' (' + st.trv.toFixed(1) + ', ' + A.pct(st.trv / st.pkv - 1) + ')' : '-'], ['고점 회복', st.rec ? A.ymk(st.rec) : '미회복'], ['현재', A.ymk(st.nowYm) + ' ' + st.now.toFixed(1) + ' (고점 대비 ' + A.pct(st.now / st.pkv - 1) + ')']] : [];
  let h = '<div class="stats">' + cyc.map(([a, b]) => '<div class="stat"><span>' + a + '</span><b>' + b + '</b></div>').join('') + '</div>';
  const span = (a, b) => { const i0 = A.MI[a], i1 = A.MI[b]; const p = i0 > 0 ? v[i0 - 1] : v[i0]; return A.pct(v[i1] / p - 1); };
  const ratePath = (a, b) => { const r0 = bokRate(A.addMonths(a, -1)), r1 = bokRate(b); const rs = A.MONTHS.filter(m => m >= a && m <= b).map(bokRate); const lo = Math.min(r0, ...rs), hi = Math.max(r0, ...rs); if (lo === hi) return r0.toFixed(2) + '% 유지'; const p = [r0.toFixed(2) + '%']; if (lo < Math.min(r0, r1)) p.push(lo.toFixed(2) + '%(최저)'); if (hi > Math.max(r0, r1)) p.push(hi.toFixed(2) + '%(최고)'); p.push(r1.toFixed(2) + '%'); return p.join(' → '); };
  const govs = (a, b) => { const g = []; for (const m of A.MONTHS) if (m >= a && m <= b) { const p = pres(m); if (!g.length || g[g.length - 1] !== p) g.push(p); } return g.join(' → '); };
  const pols = (a, b) => S.seed.policies.filter(p => { const ym = +p.date.slice(0, 4) * 100 + +p.date.slice(5, 7); return ym >= a && ym <= b && /강화|완화/.test(p.type); }).slice(0, 5).map(p => p.name + '(' + (p.type.startsWith('강화') ? '강화' : '완화') + ')').join(', ');
  const ev = r.index.booms.map(([a, b]) => ['급등기', a, b]).concat(r.index.busts.map(([a, b]) => ['급락기', a, b])).sort((x, y) => x[1] - y[1]);
  h += '<div class="phases"><table><tr><th>구분</th><th>기간</th><th>개월</th><th>지수 변화</th><th>정권</th><th>한국은행 기준금리</th><th>그 기간의 대책</th></tr>' + ev.map(([k, a, b]) => '<tr><td><span class="tag ' + (k === '급등기' ? 'tight' : 'loose') + '">' + k + '</span></td><td>' + A.ymk(a) + ' ~ ' + A.ymk(b) + (b === A.nowYm() ? ' (진행 중)' : '') + '</td><td>' + (A.mdiff(a, b) + 1) + '</td><td class="' + (k === '급등기' ? 'up' : 'down') + '">' + span(a, b) + '</td><td>' + govs(a, b) + '</td><td>' + ratePath(a, b) + '</td><td>' + (pols(a, b) || '-') + '</td></tr>').join('') + '</table></div>';
  const meta = String(r.index.meta || '').replace(/nSer=(\d+),nTr=(\d+)/, (m, a, b) => '단지·평형 ' + a + '개, 거래 ' + Number(b).toLocaleString() + '건');
  h += '<p class="note">' + (r.index.source === 'seed' ? '2026년 10월 13일까지 신고분으로 미리 계산한 지수(' + esc(meta) + ').' : '이 기기에서 받은 실거래로 계산한 지수(' + esc(meta) + ').') + '</p>';
  box.innerHTML = h;
}
function renderTimeline() {
  const box = $('#timeline'); const GM = A.MONTHS.filter(m => m >= 201901); const n = GM.length; const g0 = A.MI[GM[0]];
  const narrow = window.innerWidth < 700; box.style.gridTemplateColumns = (narrow ? '130px' : '230px') + ' repeat(' + n + ', 13px)';
  box.innerHTML = '';
  const add = (cls, html, style) => { const d = el('div', { class: cls }, html); if (style) d.setAttribute('style', style); box.appendChild(d); return d; };
  // 연도·월
  add('lab sec', '연도');
  const years = {}; GM.forEach((m, j) => (years[Math.floor(m / 100)] = years[Math.floor(m / 100)] || []).push(j));
  Object.keys(years).forEach((y, k) => add('yr' + (k % 2 ? ' alt' : ''), y + '년', 'grid-column: span ' + years[y].length));
  add('lab sec', '월'); GM.forEach(m => add('mo', m % 100));
  // 정권
  add('lab', '정권');
  const segs = []; GM.forEach(m => { const p = pres(m); if (segs.length && segs[segs.length - 1].p === p) segs[segs.length - 1].n++; else segs.push({ p, n: 1 }); });
  segs.forEach(s => add('gov', s.p === '권한대행' ? '대행' : s.p + ' 정부', 'grid-column: span ' + s.n + (s.p === '권한대행' ? ';background:#F4F6F9' : '')));
  // 기준금리
  add('lab', '한국은행 기준금리 (바뀐 달)');
  let prev = null; GM.forEach(m => { const r = bokRate(m); const t = Math.max(0, Math.min(1, (r - 0.5) / 3)); const c = 'rgb(' + Math.round(255 + (237 - 255) * t) + ',' + Math.round(242 + (125 - 242) * t) + ',' + Math.round(204 + (49 - 204) * t) + ')'; add('rate', prev === null || r !== prev ? '' : '', 'background:' + c + (prev === null || r !== prev ? ';writing-mode:vertical-rl;font-size:9px' : '')).textContent = (prev === null || r !== prev) ? r.toFixed(2) : ''; prev = r; });
  // 정책
  const ps = S.seed.policies.filter(p => p.date >= '2019');
  const polMap = {}; ps.forEach((p, i) => { const ym = +p.date.slice(0, 4) * 100 + +p.date.slice(5, 7); const t = policyType(p.type); (polMap[t + ym] = polMap[t + ym] || []).push(i + 1); });
  [['tight', '규제 강화 대책 (번호)', '#F8D7D3'], ['loose', '규제 완화·정책대출 (번호)', '#D5E3F5'], ['supply', '공급 대책·기타 (번호)', '#D9EEDF']].forEach(([t, lab, c]) => { add('lab', lab); GM.forEach(m => { const v = (polMap[t + m] || []).concat(t === 'supply' ? (polMap['etc' + m] || []) : []); const d = add('pol', v.length ? (v.length > 1 ? v.length + '건' : v[0]) : '', v.length ? 'background:' + c : ''); if (v.length) d.title = v.map(i => i + '. ' + ps[i - 1].date + ' ' + ps[i - 1].name).join('\n'); }); });
  // 지역 지수
  const r = S.region;
  if (r && r.index) {
    const dd = A.ddColors(r.index.v); const st = A.indexStats(r.index.v);
    const arrows = {}; r.index.booms.forEach(([a, b]) => A.MONTHS.forEach(m => { if (m >= a && m <= b) arrows[m] = '↑'; })); r.index.busts.forEach(([a, b]) => A.MONTHS.forEach(m => { if (m >= a && m <= b) arrows[m] = '↓'; }));
    add('lab sec', regionName(r.lawd) + ' 지수');
    GM.forEach((m, j) => { const i = g0 + j; const c = dd[i]; let mk = arrows[m] || ''; if (st && m === st.pk) mk = '▲'; if (st && (m === st.t1 || m === st.tr)) mk = '▼'; if (st && m === st.rec) mk = '★'; add(mk === '▲' || mk === '▼' || mk === '★' ? 'mark' : 'arrow', mk, c ? 'background:' + c[0] : ''); });
  }
  // 단지
  for (const col of S.cols) {
    const s = colStats(col); const y = s.cyc; const dd = A.ddColors(y.S);
    const lab = add('lab' + (col.role === 'boss' ? ' sec' : ''), roleName(col) + ' · ' + col.c.name + ' ' + colLabel(col)); lab.title = col.c.name + ' ' + colLabel(col);
    if (col.role === 'boss') lab.style.background = 'var(--boss2)';
    GM.forEach((m, j) => { const i = g0 + j; const c = dd[i]; let mk = ''; if (y.pk && m === y.pk) mk = '▲'; if (y.pk && (m === y.t1 || m === y.tr)) mk = '▼'; if (y.rec && m === y.rec) mk = '★'; const d = add('mark', mk, c ? 'background:' + c[0] : ''); if (y.S[i] != null) d.title = A.ymk(m) + ' ' + A.won(y.S[i]) + (c && c[1] ? ' (' + A.pct(c[1]) + ')' : ''); });
  }
  const wrap = box.parentElement; requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
}
function renderCxChart() {
  const cv = $('#cxChart'); if (S.charts.cx) { S.charts.cx.destroy(); S.charts.cx = null; }
  if (!S.cols.length) return;
  const GM = A.MONTHS.filter(m => m >= 201901); const g0 = A.MI[GM[0]];
  const palette = ['#C23A2F', '#2457A8', '#3C8C5A', '#8E5BB0', '#C97A1D', '#4A5568'];
  const ds = S.cols.map((col, k) => { const S_ = colStats(col).cyc.S; return { label: col.c.name + ' ' + colLabel(col), data: GM.map((m, j) => S_[g0 + j] == null ? null : Math.round(S_[g0 + j] / 100) / 100), borderColor: palette[k % palette.length], borderWidth: col.role === 'boss' ? 2.6 : 1.6, borderDash: [], pointRadius: 0, spanGaps: true, tension: 0 }; });
  S.charts.cx = new Chart(cv, { type: 'line', data: { labels: GM.map(m => Math.floor(m / 100) + '.' + String(m % 100).padStart(2, '0')), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: it => A.ymk(GM[it[0].dataIndex]), label: it => it.dataset.label + ' ' + A.won(it.raw * 10000) } } }, scales: { x: { ticks: { callback: (val, i) => (GM[i] % 100 === 1 && (window.innerWidth >= 700 || Math.floor(GM[i] / 100) % 2 === 0) ? Math.floor(GM[i] / 100) + '년' : ''), autoSkip: false, maxRotation: 0 } }, y: { title: { display: true, text: '억원 (시세 = 3개월 중간값)' } } } } });
}

/* ---------- 자료 탭 ---------- */
function renderMonthly() {
  const box = $('#monthlyTable'); if (!S.cols.length) { box.innerHTML = ''; return; }
  const yms = new Set(); const data = S.cols.map(col => { const s = colStats(col); const m = {}; for (const x of s.mon) { m[x.ym] = x; yms.add(x.ym); } return { col, m, S: s.cyc.S }; });
  const list = [...yms].sort((a, b) => b - a);
  let h = '<table><thead><tr><th>연월</th>' + S.cols.map(c => '<th class="' + colClass(c) + '" colspan="3">' + esc(c.c.name) + '<span class="sub">' + esc(colLabel(c)) + '</span></th>').join('') + '</tr><tr><th></th>' + S.cols.map(() => '<th>고가 (층)</th><th>저가 (층)</th><th>건수 · 시세</th>').join('') + '</tr></thead><tbody>';
  for (const ym of list) {
    h += '<tr><td>' + A.ymk(ym) + '</td>' + data.map(d => { const x = d.m[ym]; const sv = d.S[A.MI[ym]]; return x ? '<td>' + A.won(x.hi) + '<span class="sub">' + x.hif + '층</span></td><td>' + A.won(x.lo) + '<span class="sub">' + x.lof + '층</span></td><td>' + x.n + '건<span class="sub">' + (sv ? A.won(sv) : '') + '</span></td>' : '<td class="na">-</td><td class="na">-</td><td class="na">-</td>'; }).join('') + '</tr>';
  }
  box.innerHTML = h + (list.length ? '' : '<tr><td colspan="' + (1 + S.cols.length * 3) + '">실거래 자료가 없습니다. 설정에서 인증키를 넣으면 들어옵니다.</td></tr>') + '</tbody></table>';
}
function csvCompare() {
  const tbl = $('#compareTable table'); if (!tbl) return '';
  return Array.from(tbl.rows).map(tr => Array.from(tr.cells).map(td => '"' + td.innerText.replace(/\n/g, ' ').replace(/"/g, '""') + '"').join(',')).join('\n');
}
function csvMonthly() {
  const out = [['단지', '평형', '연월', '고가', '고가층', '저가', '저가층', '건수', '중간값', '시세(3개월중간값)']];
  for (const col of S.cols) { const s = colStats(col); for (const x of s.mon) out.push([col.c.name, colLabel(col), A.ymk(x.ym), x.hi, x.hif, x.lo, x.lof, x.n, x.med, s.cyc.S[A.MI[x.ym]] || '']); }
  return out.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
}
function downloadCsv(name, csv) {
  if (!csv) { alert('먼저 비교에 단지를 넣으세요.'); return; }
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name + '_' + A.nowYm() + '.csv' }); document.body.appendChild(a); a.click(); a.remove();
}
boot().catch(e => { console.error(e); const m = $('#regionHint'); if (m) m.textContent = '시작하지 못했습니다: ' + e.message; });
