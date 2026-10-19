/* 자료 가져오기 — 국토교통부 실거래가 API(공공데이터포털), KB부동산, 브라우저 저장소(IndexedDB) */
const DB = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open('aptcompare', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('kv'); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }
  async function get(k) { try { const db = await open(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch (e) { return undefined; } }
  async function set(k, v) { try { const db = await open(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); } catch (e) { } }
  async function keys() { try { const db = await open(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').getAllKeys(); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch (e) { return []; } }
  async function del(k) { try { const db = await open(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); } catch (e) { } }
  async function clear() { try { const db = await open(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').clear(); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); } catch (e) { } }
  return { get, set, keys, del, clear };
})();

const RT = (() => {
  const BASE = 'https://apis.data.go.kr/1613000';
  /* 매매: 공공데이터포털의 '아파트 매매 실거래가 자료'(기본)와 '…상세 자료'(Dev) 중 활용신청한 쪽을 자동으로 씀 */
  const PATHS_TRADE = ['/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade', '/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'];
  const PATH_RENT = '/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
  function key() { try { return localStorage.getItem('rt_key') || ''; } catch (e) { return ''; } }
  function setKey(k) { try { localStorage.setItem('rt_key', (k || '').trim()); localStorage.removeItem('rt_path'); } catch (e) { } }
  function tradePath() { try { const p = localStorage.getItem('rt_path'); return PATHS_TRADE.includes(p) ? p : PATHS_TRADE[0]; } catch (e) { return PATHS_TRADE[0]; } }
  function setTradePath(p) { try { localStorage.setItem('rt_path', p); } catch (e) { } }
  /* 키는 있는데 이 서비스에 등록되지 않은 경우(접근거부 20, 미등록 30) — 빈 키(SERVICE_KEY_IS_NULL)는 제외 */
  function notRegistered(e) { if (!e) return false; if (/IS_NULL/i.test(String(e.err || e.message))) return false; return e.code === '20' || e.code === '30' || /NOT_REGISTERED|ACCESS_DENIED|UNREGISTERED|등록되지 않은|접근거부/i.test(String(e.message)); }
  function text(el, tag) { const x = el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : ''; }
  function num(s) { const n = parseInt(String(s).replace(/[^0-9-]/g, ''), 10); return isNaN(n) ? null : n; }
  function parse(txt) {
    const t = txt.trim();
    if (t.startsWith('{')) { // JSON 응답(제공 시)
      const j = JSON.parse(t); const r = j.response || j;
      const h = r.header || {}; if (h.resultCode && h.resultCode !== '000' && h.resultCode !== '00') throw new Error('API 오류: ' + (h.resultMsg || h.resultCode));
      const body = r.body || {}; let items = body.items ? (body.items.item || body.items) : []; if (!Array.isArray(items)) items = [items];
      return { items, total: num(body.totalCount) || items.length };
    }
    const doc = new DOMParser().parseFromString(t, 'text/xml');
    const auth = doc.getElementsByTagName('returnAuthMsg')[0];
    if (auth) { const err = text(doc, 'errMsg'), code = text(doc, 'returnReasonCode'); const e = new Error('인증 오류: ' + (err ? err + ' — ' : '') + auth.textContent.trim() + ' (' + code + ')'); e.code = code; e.err = err; throw e; }
    const rc = text(doc, 'resultCode');
    if (rc && rc !== '000' && rc !== '00') throw new Error('API 오류: ' + text(doc, 'resultMsg'));
    const items = Array.from(doc.getElementsByTagName('item')).map(it => { const o = {}; for (const c of it.children) o[c.tagName] = c.textContent.trim(); return o; });
    return { items, total: num(text(doc, 'totalCount')) || items.length };
  }
  function toRow(it, lawd) {
    const y = num(it.dealYear), m = num(it.dealMonth), d = num(it.dealDay);
    return { d: y * 10000 + m * 100 + d, ym: y * 100 + m, p: num(it.dealAmount), f: num(it.floor), a: parseFloat(it.excluUseAr), nm: (it.aptNm || '').trim(), dong: (it.umdNm || '').trim(), by: num(it.buildYear), cancel: (it.cdealType || '').trim() === 'O' || !!(it.cdealDay || '').trim(), direct: (it.dealingGbn || '').indexOf('직거래') >= 0, seq: it.aptSeq || '', lawd };
  }
  async function call(path, params, tries) {
    const u = new URL(BASE + path);
    u.search = 'serviceKey=' + encodeURIComponent(key()) + '&' + new URLSearchParams(params).toString();
    let lastErr = null;
    for (let i = 0; i < (tries || 3); i++) {
      try {
        const r = await fetch(u.toString(), { cache: 'no-store' });
        const txt = await r.text();
        return parse(txt);
      } catch (e) { lastErr = e; if (String(e.message).startsWith('인증 오류') || String(e.message).startsWith('API 오류')) throw e; await new Promise(r => setTimeout(r, 600 * (i + 1))); }
    }
    throw new Error('연결 실패: ' + (lastErr && lastErr.message));
  }
  /* 매매 호출: 지금 쓰는 경로가 '등록되지 않은 서비스'라고 하면 다른 경로로 한 번 더 */
  async function callTrade(params, tries) {
    const p = tradePath();
    try { return await call(p, params, tries); }
    catch (e) {
      if (!notRegistered(e)) throw e;
      const other = PATHS_TRADE.find(x => x !== p);
      const r = await call(other, params, tries); setTradePath(other); return r;
    }
  }
  async function month(lawd, ym, opt) {
    const rent = !!(opt && opt.rent);
    const call2 = (params) => rent ? call(PATH_RENT, params) : callTrade(params);
    const first = await call2({ LAWD_CD: lawd, DEAL_YMD: ym, pageNo: 1, numOfRows: 1000 });
    let items = first.items;
    const pages = Math.ceil(first.total / 1000);
    for (let p = 2; p <= pages; p++) { const r = await call2({ LAWD_CD: lawd, DEAL_YMD: ym, pageNo: p, numOfRows: 1000 }); items = items.concat(r.items); }
    return items;
  }
  function cacheKey(lawd, ym, rent) { return (rent ? 'rent_' : 'trade_') + lawd + '_' + ym; }
  /* 월 자료: 저장된 것이 있으면 쓰고, 최근 2개월은 하루 지나면 다시 받음 */
  async function monthCached(lawd, ym, opt) {
    const rent = !!(opt && opt.rent); const k = cacheKey(lawd, ym, rent);
    const now = A.nowYm(); const fresh = ym >= A.addMonths(now, -2);
    const c = (opt && opt.force) ? null : await DB.get(k);
    if (c && (!fresh || (Date.now() - c.t) < 86400000)) return c.rows;
    const items = await month(lawd, ym, opt);
    const rows = rent ? items.map(it => toRent(it, lawd)) : items.map(it => toRow(it, lawd));
    await DB.set(k, { t: Date.now(), rows });
    return rows;
  }
  function toRent(it, lawd) {
    const y = num(it.dealYear), m = num(it.dealMonth), d = num(it.dealDay);
    return { d: y * 10000 + m * 100 + d, ym: y * 100 + m, dep: num(it.deposit), rent: num(it.monthlyRent) || 0, f: num(it.floor), a: parseFloat(it.excluUseAr), nm: (it.aptNm || '').trim(), dong: (it.umdNm || '').trim(), by: num(it.buildYear), ctype: (it.contractType || '').trim(), lawd };
  }
  /* 여러 달을 받으면서 진행률 알림. concurrency 3 */
  async function months(lawd, yms, onProgress, opt) {
    const out = {}; let done = 0; let idx = 0; const errors = [];
    async function worker() {
      while (idx < yms.length) {
        const ym = yms[idx++];
        try { out[ym] = await monthCached(lawd, ym, opt); } catch (e) { errors.push({ ym, e }); if (errors.length >= 3 && done === 0) throw e; }
        done++; if (onProgress) onProgress(done, yms.length, ym);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    return { out, errors };
  }
  async function test(lawd, ym) {
    const r = await callTrade({ LAWD_CD: lawd || '41465', DEAL_YMD: ym || A.addMonths(A.nowYm(), -1), pageNo: 1, numOfRows: 5 }, 1);
    return { total: r.total, sample: r.items.slice(0, 5).map(it => toRow(it, lawd || '41465')), path: tradePath() };
  }
  function serviceName() { return tradePath() === PATHS_TRADE[0] ? '아파트 매매 실거래가 자료' : '아파트 매매 실거래가 상세 자료'; }
  return { key, setKey, monthCached, months, test, parse, toRow, cacheKey, serviceName };
})();

const KB = (() => {
  const BASE = 'https://api.kbland.kr';
  const mem = {};
  async function get(path, params) {
    const ck = path + '?' + JSON.stringify(params || {});
    if (mem[ck]) return mem[ck];
    const u = new URL(BASE + path); for (const k in (params || {})) u.searchParams.set(k, params[k]);
    const r = await fetch(u.toString(), { headers: { 'Accept': 'application/json, text/plain, */*' } });
    const j = await r.json();
    if (!j.dataBody) throw new Error('KB 응답 형식 오류');
    // 대부분 dataBody.data 안에 값이 있고, 방문 수 순위처럼 dataBody 바로 아래에 있는 응답도 있음
    const d = j.dataBody.data !== undefined ? j.dataBody.data : j.dataBody; mem[ck] = d; return d;
  }
  async function fresh(path, params) { // 저장하지 않고 매번 새로 받기(방문 수 등)
    const u = new URL(BASE + path); for (const k in (params || {})) u.searchParams.set(k, params[k]);
    const r = await fetch(u.toString(), { headers: { 'Accept': 'application/json, text/plain, */*' }, cache: 'no-store' });
    const j = await r.json();
    if (!j.dataBody) throw new Error('KB 응답 형식 오류');
    return j.dataBody.data !== undefined ? j.dataBody.data : j.dataBody;
  }
  async function post(path, body) {
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify(body) });
    const j = await r.json(); return j.dataBody && (j.dataBody.data !== undefined ? j.dataBody.data : j.dataBody);
  }
  async function cached(k, fn, ttlMs, force) {
    const c = force ? null : await DB.get('kb_' + k);
    if (c && (Date.now() - c.t) < (ttlMs || 86400000)) return c.v;
    const v = await fn(); await DB.set('kb_' + k, { t: Date.now(), v }); return v;
  }
  function row(x) { return { id: +x.COMPLEX_NO, name: x.HSCM_NM, lawd: String(x.BUBCODE || '').slice(0, 5), bub: x.BUBCODE, addr: x.BUBADDR, addrShort: x.BUBADDR_SHORT, dong: String(x.BUBADDR || '').trim().split(/\s+/).pop(), hh: +x.THS_NUM, movein: x.MVIHS_DATE, kind: x.SLND_PERTY_NM, area: x.SQRMSR_SCOP, lat: +x.WGS84_LAT, lng: +x.WGS84_LNG }; }
  async function searchPage(kw, n, page) {
    const d = await get('/land-complex/serch/intgraSerch', { '검색설정명': 'SRC_HSCM', '검색키워드': kw, '출력갯수': n, '페이지설정값': page || 1 });
    const H = (((d || {}).data || {}).HSCM) || {};
    return { list: (H.data || []).map(row), total: +(H.totcnt || 0) };
  }
  /* 단지 검색: 국토부 단지명 + 시군구(앞 5자리)로 KB 단지 찾기 */
  async function search(name, lawd) { return (await searchPage(name, 10, 1)).list; }
  /* 전국 단지 이름 검색(입력 중 추천용) */
  async function suggest(text, n) { return (await searchPage(text, n || 8, 1)).list.filter(x => /아파트|주상복합/.test(x.kind) && !/분양권/.test(x.kind)); }
  /* 시·군·구 안의 모든 아파트·주상복합 목록(KB 검색을 지역 이름으로 끝까지 넘겨 받음, 하루 저장) */
  async function regionList(lawd, regionFullName, onProgress, force) {
    return cached('rl_' + lawd, async () => {
      const out = []; let page = 1, total = 0;
      do {
        const r = await searchPage(regionFullName, 100, page); total = r.total;
        for (const x of r.list) if (x.lawd === lawd && /아파트|주상복합/.test(x.kind) && !/분양권/.test(x.kind)) out.push(x);
        if (onProgress) onProgress(Math.min(page * 100, total), total);
        page++;
      } while ((page - 1) * 100 < total && page <= 30);
      const seen = {}; return out.filter(x => (seen[x.id] ? false : (seen[x.id] = true)));
    }, 86400000, force);
  }
  function norm(s) { return String(s || '').replace(/[\s\-\.·()（）]/g, '').toLowerCase(); }
  async function match(name, lawd) {
    const list = await search(name, lawd);
    const n = norm(name);
    const same = list.filter(x => !lawd || x.lawd === lawd);
    let best = same.find(x => norm(x.name) === n) || same.find(x => norm(x.name).includes(n) || n.includes(norm(x.name))) || same[0] || null;
    return { best, list };
  }
  /* 단지 기본 정보(세대수·평형·매물 수). 방문 수(viewCount)는 받은 시각(at)과 함께 둠. 10분 지나면 다시 받음 */
  async function complex(id, force) {
    return cached('cx_' + id, async () => {
      const m = await fresh('/land-complex/complex/main', { '단지기본일련번호': id });
      const t = await get('/land-complex/complex/typInfo', { '단지기본일련번호': id });
      const b = await get('/land-complex/complex/brif', { '단지기본일련번호': id });
      return { id, at: Date.now(), name: m['단지명'], kind: m['매물종별구분명'], built: m['준공년월일'], hh: m['총세대수'], lat: +m['wgs84위도'] || null, lng: +m['wgs84경도'] || null, dongs: m['총동수'], top: m['최고층수'], low: m['최저층수'], park: m['세대당주차대수비율'], heat: m['난방방식구분명'], far: m['용적률내용'], bcr: m['건폐율내용'], maker: m['시공사명'], addr: m['신주소'], hall: m['현관구조'], view: m['viewCount'], rank: m['등수'], dong: m['읍면동명'], bub: m['법정동코드'], fav: b && b['관심등록수'], listings: [m['매매건수'], m['전세건수'], m['월세건수']], reg: (m.regulList || []).map(r => r['규제명']),
        types: (t || []).map(x => ({ aid: +x['면적일련번호'], typ: x['주택형타입내용'] || '', sup: +x['공급면적'], exc: +x['전용면적'], hh: +x['세대수'], room: +x['방수'], bath: +x['욕실수'], lst: [+x['매매건수'], +x['전세건수'], +x['월세건수']] })) };
    }, 600000, force);
  }
  async function price(id, aid, force) {
    return cached('pr_' + id + '_' + aid, async () => {
      const d = await get('/land-price/price/BasePrcInfoNew', { '단지기본일련번호': id, '면적일련번호': aid });
      const s = (d && d['시세'] && d['시세'][0]) || {}; const lr = (d && d['최근실거래가']) || {};
      return { at: Date.now(), base: s['시세기준년월일'], s_lo: s['매매하한가'], s_mid: s['매매일반거래가'], s_hi: s['매매상한가'], j_lo: s['전세하한가'], j_mid: s['전세일반거래가'], j_hi: s['전세상한가'], ask_avg: d['매물매매평균가'], ask_n: d['매매건수'], jask_avg: d['매물전세평균가'], jask_n: d['전세건수'], last: lr['거래금액'], last_fl: lr['거래층'], last_dt: lr['계약년월일'], provided: s['시세제공여부'] === '1' };
    }, 3600000 * 6, force);
  }
  async function chart(id, aid, force) {
    return cached('ch_' + id + '_' + aid, async () => {
      const d = await get('/land-price/price/complex/integrationChart', { '거래구분': 0, '단지기본일련번호': id, '조회구분': 0, '면적일련번호': aid, '면적그룹여부': 1 });
      return { hh: d['세대수'], ask: [d['매물매매최저가'], d['매물매매최고가'], d['매물전세최저가'], d['매물전세최고가']], ser: (d['시세'] || []).map(m => [+m['기준년월'], m['매매일반거래가'], m['전세일반거래가']]) };
    }, 3600000 * 6, force);
  }
  /* 전국 방문 수 순위(KB 집계) */
  async function rankings() { const d = await fresh('/land-complex/count/complexes/rankings/views'); return (d && d.ranks) || []; }
  async function test() { const rk = await rankings(); return rk.slice(0, 3).map(r => r.complexName + ' ' + Number(r.viewCount).toLocaleString() + '명'); }
  return { search, suggest, regionList, match, complex, price, chart, rankings, test, post, norm };
})();

/* 호갱노노(직방 매물 자료) — 같은 집을 여러 중개업소가 올린 매물을 한 집(호)으로 묶어 주는 '동일매물 묶음' 건수.
   KB부동산은 로그인 없이는 묶음 건수를 주지 않아(매물 목록 API가 로그인 전용) 묶음 건수는 이쪽을 씀. */
const HG = (() => {
  const BASE = 'https://hogangnono.com';
  const mem = {};
  async function getJ(u) {
    if (mem[u]) return mem[u];
    const r = await fetch(u, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('호갱노노 응답 ' + r.status);
    const j = await r.json(); mem[u] = j; return j;
  }
  async function cached(k, fn, ttlMs, force) {
    const c = force ? null : await DB.get('hg_' + k);
    if (c && (Date.now() - c.t) < (ttlMs || 600000)) return c.v;
    const v = await fn(); await DB.set('hg_' + k, { t: Date.now(), v }); return v;
  }
  function norm(s) { return String(s || '').replace(/[\s\-\.·()（）]/g, '').toLowerCase(); }
  function km(a, b, c, d) { if (!(a && b && c && d)) return null; const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  async function search(name) {
    const j = await getJ(BASE + '/api/v2/searches/suggestions/new?query=' + encodeURIComponent(name));
    const list = (((j.data || {}).matched || {}).apt || {}).list || [];
    return list.map(x => ({ hash: x.id, name: x.name, addr: x.address, road: x.road_address, bub: String(x.region_code || ''), lawd: String(x.region_code || '').slice(0, 5), hh: +x.household || null, lat: +(x.lat || (x.location && x.location.lat)) || null, lng: +(x.lng || (x.location && x.location.lon)) || null, start: x.start_date, kind: x.type_name }));
  }
  /* 단지 찾기: 이름이 같고(띄어쓰기 무시) 같은 시·군·구, 세대수·위치가 가까운 것 */
  async function match(name, lawd, hh, lat, lng) {
    const list = await search(name); const n = norm(name);
    const same = list.filter(x => !lawd || x.lawd === lawd);
    const score = x => (norm(x.name) === n ? 0 : (norm(x.name).includes(n) || n.includes(norm(x.name)) ? 1 : 3)) + (hh && x.hh ? Math.min(2, Math.abs(x.hh - hh) / Math.max(hh, 1) * 4) : 0.5) + (km(lat, lng, x.lat, x.lng) != null ? Math.min(3, km(lat, lng, x.lat, x.lng)) : 0.5);
    const best = same.slice().sort((a, b) => score(a) - score(b))[0] || null;
    return { best: best && score(best) < 4 ? best : null, list };
  }
  /* 매물 묶음: 한 호(areaHoId)가 한 건, itemCount = 그 집을 올린 중개업소 수 */
  async function catalog(hash, force) {
    return cached('cat_' + hash, async () => {
      let off = 0, total = 0, items = [], per = null;
      do {
        const j = await getJ(BASE + '/api/v2/item-catalogs/summaries?aptHash=' + encodeURIComponent(hash) + '&isAptDetail=false&offset=' + off + '&limit=200&_=' + Date.now());
        const d = j.data || {}; const l = d.itemCatalogSummaries || []; total = +d.itemCatalogTotalCount || 0; per = per || d.itemCatalogCountPerTradeType || {};
        items = items.concat(l); off += 200; if (!l.length) break;
      } while (off < total && off < 2000);
      const TT = { 0: 'trade', 1: 'deposit', 2: 'rent' };
      const groups = {}; let raw = 0;
      const rows = items.map(x => { const g = Math.floor(+x.privateArea); const tt = TT[x.tradeType] || 'etc'; const n = +x.itemCount || 1; raw += n; const p = +x.deposit || 0; const G = groups[g] = groups[g] || { trade: 0, deposit: 0, rent: 0, raw: 0, min: null, max: null }; G[tt] = (G[tt] || 0) + 1; G.raw += n; if (tt === 'trade' && p) { G.min = G.min == null ? p : Math.min(G.min, p); G.max = G.max == null ? p : Math.max(G.max, p); } return { g, tt, dong: x.aptDongName, fl: x.floor, p, rent: +x.rent || 0, n, typ: x.danjiRoomType }; });
      return { at: Date.now(), total, trade: +per.trade || 0, deposit: +per.deposit || 0, rent: +per.rent || 0, raw, groups, rows };
    }, 600000, force);
  }
  return { search, match, catalog };
})();
