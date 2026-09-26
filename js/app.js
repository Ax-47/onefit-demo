/* OneFit — app logic. Depends on js/data.js */

/* ---------- Dates ---------- */
const dkey = (d = new Date()) => d.toLocaleDateString('sv-SE');
const addDays = (key, n) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dkey(d); };
const TH_DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const dow = key => TH_DOW[new Date(key + 'T12:00:00').getDay()];
const nowT = () => new Date().toTimeString().slice(0, 5);

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('th-TH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId = id => FOODS.find(f => f.id === id);
const round50 = n => Math.round(n / 50) * 50;
function toast(msg){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }

/* ---------- State ---------- */
const FREE_SCANS = 5, WATER_GOAL = 8;
const TODAY = dkey();

function seed(){
  const S = {
    v:2, onboarded:true, premium:false, sample:true,
    profile:{name:'มิชา', sex:'f', age:22, height:163, weight:58, activity:1.375, goal:'lose'},
    level:'mid', focus:'full',
    settings:{voice:true, sound:true, theme:'auto'},
    days:{}, weights:[], coupons:[], badges:{}, custom:[], checkins:[],
  };
  // Six past days of plausible history so charts and streaks have something to show
  const hist = [
    {f:['jok','kmk','latte','salad'], w:[['HIIT เผาผลาญ 10 นาที',92,10]], water:7},
    {f:['kpr','thai','yum','banana'], w:[], water:5},
    {f:['yog','ptk','boba','stm'], w:[['มินิเวิร์กเอาต์ชดเชย',118,15,true]], water:8},
    {f:['egg','krs','chz','salad'], w:[['หน้าท้องแบนราบ 7 นาที',44,7]], water:6},
    {f:['jok','mkt','ame'], w:[['มินิเวิร์กเอาต์ชดเชย',121,15,true]], water:8},
    {f:['croi','latte','kmk','yum'], w:[['Office Break 5 นาที',18,5]], water:6},
  ];
  const times = ['08:10','12:30','15:40','19:10'];
  hist.forEach((h, i) => {
    const k = addDays(TODAY, i - 6);
    S.days[k] = {water:h.water, scans:3, log:[
      ...h.f.map((id, j) => ({t:times[j] || '20:00', kind:'food', id, q:1})),
      ...h.w.map(([name, burn, min, offset]) => ({t:'18:30', kind:'workout', name, burn, min, offset:!!offset})),
    ]};
  });
  S.days[TODAY] = {water:5, scans:3, log:[
    {t:'08:05', kind:'food', id:'jok', q:1},
    {t:'12:35', kind:'food', id:'kpr', q:1},
    {t:'15:20', kind:'food', id:'bing', q:1},
    {t:'16:05', kind:'food', id:'thai', q:1},
  ]};
  S.weights = [59.4, 59.1, 59.2, 58.8, 58.6, 58.7, 58.3].map((kg, i) => ({d:addDays(TODAY, (i - 6) * 3), kg}));
  S.profile.weight = 58.3;
  S.badges = {scan1:addDays(TODAY,-6), wo1:addDays(TODAY,-6), offset1:addDays(TODAY,-4), water:addDays(TODAY,-4), weigh:addDays(TODAY,-9)};
  S.coupons = [{shop:'Juice Lab', deal:'ซื้อ 1 แถม 1 น้ำผักผลไม้สกัดเย็น', code:'FITJ7K2Q'}];
  return S;
}
function blank(){
  const s = seed();
  return {...s, onboarded:false, sample:false, days:{[TODAY]:{water:0, scans:0, log:[]}}, weights:[], badges:{}, coupons:[], custom:[], checkins:[]};
}

let S;
try { S = JSON.parse(localStorage.getItem('onefit2') || 'null'); } catch(e){ S = null; }
if (!S || S.v !== 2) S = seed();
const save = () => { try { localStorage.setItem('onefit2', JSON.stringify(S)); } catch(e){} };
const day = (k = TODAY) => (S.days[k] ||= {water:0, scans:0, log:[]});
day();

/* ---------- Nutrition math ---------- */
function bmr(p = S.profile){ return 10*p.weight + 6.25*p.height - 5*p.age + (p.sex === 'm' ? 5 : -161); }
function tdee(p = S.profile){ return bmr(p) * p.activity; }
function goalKcal(p = S.profile){ const g = GOALS.find(g => g.id === p.goal); return Math.max(1200, round50(tdee(p) + g.adj)); }
function macroTargets(){
  const k = goalKcal(), p = S.profile;
  const prot = Math.round(p.weight * (p.goal === 'gain' ? 1.8 : p.goal === 'lose' ? 1.6 : 1.4));
  const fat = Math.round(k * .27 / 9);
  const carb = Math.max(0, Math.round((k - prot*4 - fat*9) / 4));
  return [prot, carb, fat];
}
const kcalPerMin = met => met * 3.5 * S.profile.weight / 200;
function foodOf(l){ return l.custom || byId(l.id); }
function entryKcal(l){ return l.kind === 'food' ? foodOf(l).k * l.q : -l.burn; }
function totals(k = TODAY){
  let food = 0, burn = 0, m = [0,0,0];
  day(k).log.forEach(l => {
    if (l.kind === 'food'){ const f = foodOf(l); food += f.k*l.q; f.m.forEach((v,i) => m[i] += v*l.q); }
    else burn += l.burn;
  });
  const goal = goalKcal();
  return {food, burn, net:food - burn, goal, over:Math.max(0, food - burn - goal), m};
}
const scansLeft = () => S.premium ? Infinity : Math.max(0, FREE_SCANS - day().scans);
function streak(){
  let n = 0, k = TODAY;
  const has = k => (S.days[k]?.log || []).some(l => l.kind === 'workout');
  if (!has(k)) k = addDays(k, -1);
  while (has(k)){ n++; k = addDays(k, -1); }
  return n;
}
const totalBurn = () => Object.values(S.days).reduce((a, d) => a + d.log.filter(l => l.kind === 'workout').reduce((b, l) => b + l.burn, 0), 0);
const weekBurn = () => { let s = 0; for (let i = 0; i < 7; i++){ const d = S.days[addDays(TODAY, -i)]; if (d) s += d.log.filter(l => l.kind === 'workout').reduce((b, l) => b + l.burn, 0); } return s; };

/* ---------- Badges ---------- */
function award(id){
  if (S.badges[id]) return;
  S.badges[id] = TODAY; save();
  const b = BADGES.find(b => b.id === id);
  setTimeout(() => toast(`ปลดล็อกเหรียญ ${b.i} ${b.n}`), 600);
}
function checkBadges(){
  if (day().water >= WATER_GOAL) award('water');
  const st = streak();
  if (st >= 3) award('streak3');
  if (st >= 7) award('streak7');
  if (totalBurn() >= 1000) award('burn1k');
  if (S.weights.length >= 3) award('weigh');
}

/* ---------- Theme ---------- */
function applyTheme(){
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ---------- Router ---------- */
let tab = 'home', cat = 'all', q = '', scanMode = 'photo', exFilter = 'all';
const TABS = ['home','workout','scan','progress','me'];

function renderHeader(){
  const st = streak();
  $('#hdr').innerHTML = `
    ${st ? `<span class="pill hot num" title="ออกกำลังกายต่อเนื่อง">🔥 ${st} วัน</span>` : ''}
    <span class="pill num">${S.premium ? 'สแกนไม่จำกัด' : `สแกน ${scansLeft()}/${FREE_SCANS}`}</span>
    <span class="pill${S.premium ? ' pro' : ''}">${S.premium ? 'Premium' : 'Free'}</span>`;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}
function render(){
  applyTheme();
  renderHeader();
  $('#view').innerHTML = ({home:viewHome, workout:viewWorkout, scan:viewScan, progress:viewProgress, me:viewMe})[tab]();
  if (tab === 'scan') bindScan();
  if (tab === 'progress') bindCharts();
}
function go(t){ tab = t; render(); window.scrollTo(0, 0); }
function closeSheet(){ $('#overlay').innerHTML = ''; }
function sheet(html, dismiss = true){
  $('#overlay').innerHTML = `<div class="scrim" ${dismiss ? 'onclick="if(event.target===this)closeSheet()"' : ''}><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
}

/* ================= HOME ================= */
const MEAL_SLOTS = [['เช้า',0,10.5],['กลางวัน',10.5,14.5],['ของว่าง',14.5,17.5],['เย็น',17.5,24]];
function slotOf(t){ const h = +t.slice(0,2) + (+t.slice(3,5))/60; return MEAL_SLOTS.find(s => h >= s[1] && h < s[2])[0]; }

function mealRow(l, i){
  if (l.kind === 'food'){
    const f = foodOf(l);
    const th = l.img ? `<img src="${l.img}" alt="">` : f.e;
    return `<div class="meal"><div class="thumb">${th}</div><div style="min-width:0"><div class="name">${esc(f.n)}${l.q !== 1 ? ` <span class="muted small">×${l.q}</span>` : ''}</div><div class="small faint">${l.t}</div></div><div class="kcal num">${fmt(entryKcal(l))}</div><button class="x" aria-label="ลบ ${esc(f.n)}" onclick="delLog(${i})">✕</button></div>`;
  }
  return `<div class="meal"><div class="thumb" style="background:var(--good-soft)">🔥</div><div style="min-width:0"><div class="name">${esc(l.name)}</div><div class="small faint">${l.t} · ${l.min} นาที${l.offset ? ' · ชดเชยส่วนเกิน' : ''}</div></div><div class="kcal neg num">−${fmt(l.burn)}</div><button class="x" aria-label="ลบ ${esc(l.name)}" onclick="delLog(${i})">✕</button></div>`;
}

function viewHome(){
  const T = totals(), over = T.over > 0, pct = Math.min(1, Math.max(0, T.net / T.goal));
  const R = 56, C = 2 * Math.PI * R;
  const MT = macroTargets(), MN = ['โปรตีน','คาร์บ','ไขมัน'];
  const d = day();
  const log = d.log.map((l, i) => ({l, i}));
  const groups = MEAL_SLOTS.map(([s]) => [s, log.filter(x => x.l.kind === 'food' && slotOf(x.l.t) === s)]).filter(g => g[1].length);
  const wos = log.filter(x => x.l.kind === 'workout');
  const h = new Date().getHours();
  const greet = h < 11 ? 'อรุณสวัสดิ์' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  return `
  <div class="sec-head"><div><div class="small muted">${greet}</div><h2>${esc(S.profile.name)}</h2></div>
    ${S.sample ? `<button class="linkbtn" onclick="startFresh()">ล้างข้อมูลตัวอย่าง</button>` : ''}</div>
  ${S.sample ? `<p class="demo-note" style="text-align:left;margin-top:-8px">กำลังแสดงข้อมูลตัวอย่าง 7 วันเพื่อเดโม</p>` : ''}
  <section class="card">
    <div class="hero">
      <div class="ring">
        <svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
        <circle cx="66" cy="66" r="${R}" fill="none" stroke="${over ? 'var(--coral)' : 'var(--good)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <div class="center"><div class="big num" style="color:${over ? 'var(--coral)' : 'var(--ink)'}">${fmt(over ? T.over : T.goal - T.net)}</div><div class="small muted">${over ? 'kcal เกินเป้า' : 'kcal เหลือ'}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><span class="muted">เป้าหมาย</span><b class="num">${fmt(T.goal)}</b></div>
        <div class="stat"><span class="muted">กินไป</span><b class="num">${fmt(T.food)}</b></div>
        <div class="stat"><span class="muted">เผาผลาญ</span><b class="num" style="color:var(--good)">−${fmt(T.burn)}</b></div>
        <div class="stat"><span class="muted">สุทธิ</span><b class="num">${fmt(T.net)}</b></div>
      </div>
    </div>
    <div class="macros">${MN.map((n, i) => `<div><div class="lab"><span>${n}</span><span class="num">${Math.round(T.m[i])}/${MT[i]} ก.</span></div><div class="meter"><i style="width:${Math.min(100, T.m[i] / MT[i] * 100)}%;${T.m[i] > MT[i] * 1.1 ? 'background:var(--coral)' : ''}"></i></div></div>`).join('')}</div>
  </section>
  ${over ? `<section class="over-banner">
      <div style="flex:1"><div class="small muted">กินเกินเป้าไป</div><div class="kc num">${fmt(T.over)} kcal</div><div class="small muted">ไม่ต้องรู้สึกผิด เผาผลาญส่วนเกินได้ใน 10–15 นาที</div></div>
      <button class="btn coral" onclick="go('workout')">ชดเชยเลย</button>
    </section>` : `<section class="ok-banner small"><b>อยู่ในเป้าหมาย</b> · กินของชอบได้อีก ${fmt(T.goal - T.net)} kcal วันนี้</section>`}
  <section class="card stack">
    <div class="sec-head"><h3>น้ำดื่ม</h3><span class="small muted num">${d.water}/${WATER_GOAL} แก้ว · ${d.water * 250} มล.</span></div>
    <div class="water">${Array.from({length:WATER_GOAL}, (_, i) => `<button class="glass${i < d.water ? ' full' : ''}" aria-label="แก้วที่ ${i + 1}" onclick="setWater(${i + 1})"></button>`).join('')}</div>
  </section>
  <section class="card">
    <div class="sec-head" style="margin-bottom:6px"><h3>มื้อวันนี้</h3><button class="btn ghost sm" onclick="go('scan')">+ เพิ่มมื้อ</button></div>
    ${groups.length ? groups.map(([s, items]) => `<div class="meal-group"><div class="sec-head"><span class="eyebrow">${s}</span><span class="tiny faint num">${fmt(items.reduce((a, x) => a + entryKcal(x.l), 0))} kcal</span></div>${items.map(x => mealRow(x.l, x.i)).join('')}</div>`).join('')
      : `<p class="muted small">ยังไม่มีมื้ออาหารวันนี้ กดปุ่มสแกนด้านล่างเพื่อเริ่มบันทึก</p>`}
  </section>
  <section class="card">
    <div class="sec-head" style="margin-bottom:6px"><h3>ออกกำลังกายวันนี้</h3><button class="btn ghost sm" onclick="go('workout')">+ เริ่ม</button></div>
    ${wos.length ? wos.map(x => mealRow(x.l, x.i)).join('') : `<p class="muted small">ยังไม่ได้ขยับเลยวันนี้ ลอง Office Break 5 นาทีก็ได้</p>`}
  </section>`;
}
function delLog(i){ day().log.splice(i, 1); save(); render(); }
function setWater(n){ const d = day(); d.water = d.water === n ? n - 1 : n; save(); checkBadges(); render(); }
function startFresh(){ S.sample = false; S.days = {[TODAY]:{water:0, scans:0, log:[]}}; S.weights = [{d:TODAY, kg:S.profile.weight}]; S.badges = {}; S.coupons = []; save(); render(); toast('เริ่มบันทึกใหม่แล้ว'); }

/* ================= SCAN ================= */
function viewScan(){
  const left = scansLeft();
  const modes = [['photo','ถ่ายรูป'],['menu','ค้นหาเมนู'],['partner','QR ร้าน'],['custom','กรอกเอง']];
  let body = '';
  if (scanMode === 'photo'){
    body = `
    <label class="drop" id="drop" for="file">
      <div class="cam"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--lime-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></div>
      <b>ถ่ายรูป / อัปโหลดรูปอาหาร</b>
      <span class="small muted">${left === Infinity ? 'Premium: สแกนได้ไม่จำกัด' : `เหลือสิทธิ์สแกนฟรี ${left} มื้อวันนี้`}</span>
      <input type="file" id="file" accept="image/*" capture="environment" hidden>
    </label>
    <div class="eyebrow">หรือลองสแกนเมนูยอดนิยม</div>
    <div class="grid-foods">${['mkt','kpr','boba','kmk','bing','pizza'].map(id => foodBtn(byId(id))).join('')}</div>`;
  } else if (scanMode === 'menu'){
    const list = FOODS.filter(f => (cat === 'all' || f.c === cat) && (!q || f.n.toLowerCase().includes(q.toLowerCase())));
    const recent = [...new Set(Object.keys(S.days).sort().reverse().flatMap(k => S.days[k].log.filter(l => l.kind === 'food' && l.id).map(l => l.id)))].slice(0, 6);
    body = `
    <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="q" placeholder="ค้นหาเมนู เช่น ชาไทย, หมูกระทะ" value="${esc(q)}" aria-label="ค้นหาเมนู"></div>
    ${!q && recent.length ? `<div class="eyebrow">กินบ่อย</div><div class="chips">${recent.map(id => `<button class="chip" onclick="pickFood('${id}')">${byId(id).e} ${byId(id).n}</button>`).join('')}</div>` : ''}
    <div class="chips">${CATS.map(([k, v]) => `<button class="chip${cat === k ? ' on' : ''}" onclick="cat='${k}';render()">${v}</button>`).join('')}</div>
    <div class="grid-foods" id="foodGrid">${list.map(foodBtn).join('') || '<p class="muted small">ไม่พบเมนูนี้ ลองแท็บ "กรอกเอง"</p>'}</div>
    <p class="demo-note">เลือกจากฐานข้อมูลโดยตรงไม่เสียสิทธิ์สแกน</p>`;
  } else if (scanMode === 'partner'){
    body = `
    <p class="small muted">ร้านพาร์ทเนอร์มีป้าย QR บนโต๊ะ สแกนแล้วเห็นแคลอรีทุกเมนูของร้าน พร้อมรับสิทธิพิเศษ</p>
    ${PARTNERS.map(p => `<button class="partner" onclick="openPartner('${p.id}')">
      <div class="qr"><svg width="30" height="30" viewBox="0 0 7 7" aria-hidden="true"><path fill="#C9E86A" d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z"/><path fill="#16302A" d="M1 1h1v1H1zM5 1h1v1H5zM1 5h1v1H1z"/></svg></div>
      <div style="flex:1;min-width:0"><b>${p.n}</b><div class="small muted">${p.area} · ${p.menu.length} เมนู</div><div class="small" style="color:var(--good)">${p.deal}</div></div>
      ${S.checkins.includes(p.id) ? '<span class="pill">เคยเช็กอิน</span>' : ''}</button>`).join('')}`;
  } else {
    body = `
    <form class="card stack" id="customForm">
      <label class="field"><span>ชื่อเมนู</span><input id="cName" required placeholder="เช่น ข้าวกล่องจากบ้าน"></label>
      <div class="two">
        <label class="field"><span>แคลอรี (kcal)</span><input id="cKcal" type="number" min="0" max="5000" required placeholder="450"></label>
        <label class="field"><span>โปรตีน (ก.)</span><input id="cP" type="number" min="0" max="300" placeholder="20"></label>
        <label class="field"><span>คาร์บ (ก.)</span><input id="cC" type="number" min="0" max="500" placeholder="50"></label>
        <label class="field"><span>ไขมัน (ก.)</span><input id="cF" type="number" min="0" max="300" placeholder="15"></label>
      </div>
      <button class="btn block" type="submit">บันทึกมื้อนี้</button>
    </form>`;
  }
  return `
  <div><h2>บันทึกอาหาร</h2><p class="muted small">ถ่ายรูปอาหารอะไรก็ได้ AI จะประเมินส่วนผสมและแคลอรีให้</p></div>
  <div class="seg" role="tablist">${modes.map(([k, v]) => `<button role="tab" class="${scanMode === k ? 'on' : ''}" onclick="scanMode='${k}';render()">${v}</button>`).join('')}</div>
  ${body}`;
}
const foodBtn = f => `<button class="food" onclick="pickFood('${f.id}')"><span class="e">${f.e}</span><span class="n">${f.n}</span><span class="k num">~${fmt(f.k)} kcal</span></button>`;

function bindScan(){
  const qi = $('#q');
  if (qi) qi.addEventListener('input', e => {
    q = e.target.value.trim();
    const list = FOODS.filter(f => (cat === 'all' || f.c === cat) && (!q || f.n.toLowerCase().includes(q.toLowerCase())));
    $('#foodGrid').innerHTML = list.map(foodBtn).join('') || '<p class="muted small">ไม่พบเมนูนี้ ลองแท็บ "กรอกเอง"</p>';
  });
  const f = $('#file'), d = $('#drop');
  if (f){
    f.addEventListener('change', () => { if (f.files[0]) readImg(f.files[0]); f.value = ''; });
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('drag'); });
    d.addEventListener('dragleave', () => d.classList.remove('drag'));
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('drag'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) readImg(file); });
  }
  const cf = $('#customForm');
  if (cf) cf.addEventListener('submit', e => {
    e.preventDefault();
    const n = $('#cName').value.trim(), k = +$('#cKcal').value;
    if (!n || !(k >= 0)) return;
    const m = [+$('#cP').value || 0, +$('#cC').value || 0, +$('#cF').value || 0];
    addFood({custom:{n, e:'🍽️', k, m, ing:[]}, q:1});
  });
}

function addFood(entry){
  const before = totals().over;
  day().log.push({t:nowT(), kind:'food', ...entry});
  save(); closeSheet();
  const after = totals().over;
  tab = 'home'; render();
  toast(after > before ? `เกินเป้า ${fmt(after)} kcal · มีมินิเวิร์กเอาต์รออยู่` : `บันทึก ${foodOf(entry).n} แล้ว`);
}

function readImg(file){
  if (scansLeft() <= 0){ paywall('ใช้สิทธิ์สแกนฟรีครบ 5 มื้อแล้ววันนี้'); return; }
  const r = new FileReader();
  r.onload = () => shrink(r.result, small => guessFromImage(small, ids => startScan(ids[0], small, ids)));
  r.readAsDataURL(file);
}
function shrink(src, cb){
  const im = new Image();
  im.onload = () => { const s = Math.min(1, 320 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', .8)); };
  im.onerror = () => cb(src);
  im.src = src;
}
/* Demo stand-in for the vision model: shortlist dishes by the photo's dominant colour */
function guessFromImage(src, cb){
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4){ r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; r /= n; g /= n; b /= n;
    let pool;
    if (g > r && g > b) pool = ['salad','stm','yum','kpr'];
    else if (r > 150 && g > 120 && b < 110) pool = ['ptk','mpk','croi','fch','ktm','roti','fries'];
    else if (r > g + 25) pool = ['mkt','kpr','pizza','bing','shabu','sushi'];
    else if (b > r) pool = ['boba','latte','thai','shabu'];
    else pool = ['kmk','kpm','krs','jok','burger','chz','kkm'];
    const seed = Math.round(r + g * 3 + b * 7);
    cb(pool.map((_, i) => pool[(i + seed) % pool.length]).slice(0, 4));
  };
  im.onerror = () => cb(['kmk','kpr','ptk','kpm']);
  im.src = src;
}
function pickFood(id){ showResult(byId(id), null, null, false); }

function startScan(id, img, alts){
  if (scansLeft() <= 0){ paywall('ใช้สิทธิ์สแกนฟรีครบ 5 มื้อแล้ววันนี้'); return; }
  const f = byId(id);
  sheet(`<div class="photo">${img ? `<img src="${img}" alt="รูปอาหารที่อัปโหลด">` : f.e}<div class="scanline"></div></div>
    <div style="text-align:center"><h2>AI กำลังวิเคราะห์อาหาร…</h2><p class="small muted" style="margin-top:4px">ตรวจจับวัตถุดิบ · เทียบฐานข้อมูลอาหาร · ประเมินปริมาณ</p></div>`, false);
  setTimeout(() => { day().scans++; award('scan1'); save(); renderHeader(); showResult(f, img, alts, true); }, 1600);
}

function showResult(f, img, alts, scanned){
  const conf = img ? 72 + (f.id.length * 7) % 18 : 94;
  let qty = 1;
  const draw = () => {
    sheet(`
      ${img || scanned ? `<div class="photo" style="aspect-ratio:16/9">${img ? `<img src="${img}" alt="รูปอาหารที่อัปโหลด">` : f.e}</div>` : ''}
      <div class="sec-head"><div>${scanned ? '<div class="eyebrow">AI ตรวจพบ</div>' : `<div style="font-size:40px;line-height:1">${f.e}</div>`}<h2>${esc(f.n)}</h2></div><div style="text-align:right"><div class="num" style="font-family:var(--display);font-weight:700;font-size:28px;line-height:1">${fmt(f.k * qty)}</div><div class="small muted">kcal</div></div></div>
      ${scanned ? `<div><div class="row between small"><span class="muted">ความมั่นใจ</span><span class="num">${conf}%</span></div><div class="conf"><i style="width:${conf}%"></i></div></div>` : ''}
      ${alts ? `<div class="stack" style="gap:6px"><span class="small muted">ไม่ใช่เมนูนี้? เลือกที่ถูกต้อง</span><div class="alts">${alts.filter(a => a !== f.id).map(a => `<button class="chip" data-alt="${a}">${byId(a).e} ${byId(a).n}</button>`).join('')}<button class="chip" data-alt="__menu">ค้นหาเอง…</button></div></div>` : ''}
      <div class="tiles"><div><b class="num">${Math.round(f.m[0] * qty)} ก.</b><span class="small muted">โปรตีน</span></div><div><b class="num">${Math.round(f.m[1] * qty)} ก.</b><span class="small muted">คาร์บ</span></div><div><b class="num">${Math.round(f.m[2] * qty)} ก.</b><span class="small muted">ไขมัน</span></div></div>
      ${f.ing && f.ing.length ? `<div><div class="eyebrow" style="margin-bottom:4px">ส่วนผสมที่ประเมินได้</div>${f.ing.map(([n, k]) => `<div class="ing"><span>${n}</span><span class="num muted">${fmt(k * qty)} kcal</span></div>`).join('')}</div>` : ''}
      <label class="field"><span class="row between"><span>ปริมาณที่กิน</span><b class="num" style="color:var(--ink)">${qty}×</b></span><input type="range" id="qty" min="0.25" max="2" step="0.25" value="${qty}"></label>
      <div class="small muted">ต้องออกกำลังกายประมาณ <b class="num" style="color:var(--ink)">${Math.round(f.k * qty / kcalPerMin(8))} นาที</b> (HIIT) เพื่อเผาผลาญมื้อนี้</div>
      <div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">ยกเลิก</button><button class="btn" style="flex:2" id="addBtn">บันทึกมื้อนี้</button></div>
      ${img ? '<p class="demo-note">โหมดเดโม: ผลจาก AI เป็นการจำลอง แอปจริงใช้โมเดล Computer Vision</p>' : ''}`);
    $('#qty').addEventListener('input', e => { qty = +e.target.value; draw(); $('#qty').focus(); });
    $$('[data-alt]').forEach(b => b.onclick = () => { if (b.dataset.alt === '__menu'){ closeSheet(); scanMode = 'menu'; go('scan'); } else showResult(byId(b.dataset.alt), img, alts, scanned); });
    $('#addBtn').onclick = () => addFood(f.id && byId(f.id) ? {id:f.id, q:qty, img:img || undefined} : {custom:f, q:qty});
  };
  draw();
}

function openPartner(pid){
  const p = PARTNERS.find(p => p.id === pid);
  if (!S.checkins.includes(pid)){ S.checkins.push(pid); award('partner'); save(); }
  sheet(`<div class="eyebrow">สแกน QR ร้านพาร์ทเนอร์</div><h2>${p.n}</h2>
    <div class="ok-banner small">${p.deal}</div>
    <div class="stack" style="gap:0">${p.menu.map((m, i) => `<button class="ex" onclick="pickPartner('${pid}',${i})"><div class="thumb">${m.e}</div><div style="flex:1"><div style="font-weight:500">${m.n}</div><div class="small muted num">P ${m.m[0]} · C ${m.m[1]} · F ${m.m[2]} ก.</div></div><b class="num">${fmt(m.k)}</b></button>`).join('')}</div>
    <button class="btn ghost block" onclick="closeSheet()">ปิด</button>`);
}
function pickPartner(pid, i){ const p = PARTNERS.find(p => p.id === pid), m = p.menu[i]; showResult({...m, ing:[], id:null, n:`${m.n} · ${p.n}`}, null, null, false); }

/* ================= WORKOUT ================= */
const FOCUS = [['full','ทั้งตัว',false],['core','หน้าท้อง',true],['legs','ต้นขา',true],['arms','แขน',true]];
const level = () => LEVELS.find(l => l.id === S.level);

function buildOffset(target){
  const pool = EX.filter(e => e.f.includes(S.focus)).sort((a, b) => b.met - a.met);
  const L = level(), rounds = [];
  let burn = 0, i = 0;
  while (rounds.length < 15){ // one round = 1 min → 15-minute cap
    const e = pool[i++ % pool.length];
    rounds.push(e.id);
    burn += kcalPerMin(e.met) * L.work / 60 + kcalPerMin(2.5) * L.rest / 60;
    if (rounds.length >= 10 && burn >= target) break; // 10-minute minimum
  }
  return {id:'offset', n:'มินิเวิร์กเอาต์ชดเชย', rounds, offset:true};
}
function estimate(prog){
  const L = level(), rest = prog.rest === false ? 5 : L.rest, work = prog.rest === false ? 45 : L.work;
  const n = prog.rounds.length, sec = n * work + (n - 1) * rest;
  const burn = prog.rounds.reduce((a, id) => a + kcalPerMin(exById(id).met) * work / 60, 0) + kcalPerMin(2.5) * rest * (n - 1) / 60;
  return {min:Math.round(sec / 60), burn};
}

function viewWorkout(){
  const T = totals(), target = T.over || 80, P = buildOffset(target), E = estimate(P);
  const progs = [...PROGRAMS, ...S.custom];
  const exs = EX.filter(e => exFilter === 'all' || e.f.includes(exFilter));
  return `
  <div><h2>เวิร์กเอาต์</h2><p class="small muted">ไม่ต้องใช้อุปกรณ์ ทำที่บ้าน หอ หรือออฟฟิศได้</p></div>
  <section class="offset-card">
    <div class="row between"><span class="eyebrow" style="color:inherit;opacity:.7">ชดเชยแคลอรีส่วนเกิน</span><span class="pill pro">${level().n} · ${level().work}/${level().rest} วิ</span></div>
    <div><div class="big num">${T.over ? `${fmt(T.over)} kcal` : 'ยังไม่เกินเป้า'}</div><div class="small muted">${T.over ? 'แอปจัดเซตให้อัตโนมัติจากมื้อที่กินเกิน' : 'เผาผลาญล่วงหน้าไว้ก่อน เผื่อมื้อเย็นจัดเต็ม'}</div></div>
    <div class="focus">${FOCUS.map(([k, v, pro]) => `<button class="${S.focus === k ? 'on' : ''}" onclick="setFocus('${k}',${pro})">${v}${pro && !S.premium ? '<span class="lock">PRO</span>' : ''}</button>`).join('')}</div>
    <div class="tiles" style="color:var(--ink)"><div><b class="num">${E.min}</b><span class="small muted">นาที</span></div><div><b class="num">${fmt(E.burn)}</b><span class="small muted">kcal (ประมาณ)</span></div><div><b class="num">${P.rounds.length}</b><span class="small muted">ท่า</span></div></div>
    ${T.over && E.burn < target ? `<p class="small muted">เซสชันนี้ชดเชยได้ ~${fmt(E.burn)} จาก ${fmt(target)} kcal ส่วนที่เหลือแนะนำเดินเพิ่ม 30 นาที หรือทำอีกเซสชันตอนเย็น</p>` : ''}
    <div class="row"><button class="btn ghost" style="flex:1;color:inherit;border-color:rgba(127,127,127,.4)" onclick="previewProgram('offset')">ดูท่า</button><button class="btn lime" style="flex:2" onclick="startProgram('offset')">เริ่ม ${E.min} นาที</button></div>
  </section>
  <section class="stack">
    <div class="sec-head"><h3>ความหนัก</h3><span class="small muted">ใช้กับทุกโปรแกรม</span></div>
    <div class="seg">${LEVELS.map(l => `<button class="${S.level === l.id ? 'on' : ''}" onclick="S.level='${l.id}';save();render()">${l.n}<br><span class="tiny faint num">${l.work}/${l.rest} วิ</span></button>`).join('')}</div>
  </section>
  <section class="stack">
    <div class="sec-head"><h3>โปรแกรม</h3><button class="linkbtn" onclick="openBuilder()">+ สร้างเอง${S.premium ? '' : ' (PRO)'}</button></div>
    <div class="programs">${progs.map(p => { const e = estimate(p); return `<button class="prog ${p.color || 'mint'}" onclick="previewProgram('${p.id}')">${p.pro && !S.premium ? '<span class="lock">PRO</span>' : ''}<span class="tiny faint">${esc(p.tag)}</span><span class="n">${esc(p.n)}</span><span class="meta num">${e.min} นาที · ~${fmt(e.burn)} kcal</span></button>`; }).join('')}</div>
  </section>
  <section class="stack">
    <h3>คลังท่าออกกำลังกาย</h3>
    <div class="chips">${[['all','ทั้งหมด'],['full','ทั้งตัว'],['core','หน้าท้อง'],['legs','ขา/ก้น'],['arms','แขน/อก'],['office','ออฟฟิศ'],['stretch','ยืดเหยียด']].map(([k, v]) => `<button class="chip${exFilter === k ? ' on' : ''}" onclick="exFilter='${k}';render()">${v}</button>`).join('')}</div>
    <div class="card" style="padding-block:6px">${exs.map(e => `<button class="ex" onclick="exDetail('${e.id}')"><div class="idx">${e.th.slice(0, 1)}</div><div style="flex:1;min-width:0"><div style="font-weight:500">${e.th}</div><div class="small muted">${e.n} · ${e.mus}</div></div><span class="small faint num">${kcalPerMin(e.met).toFixed(1)} kcal/นาที</span></button>`).join('')}</div>
  </section>
  <p class="demo-note">แคลอรีคำนวณจาก MET × น้ำหนัก ${S.profile.weight} กก. เป็นค่าประมาณ</p>`;
}
function setFocus(k, pro){ if (pro && !S.premium){ paywall('เวิร์กเอาต์ชดเชยเฉพาะจุดเป็นฟีเจอร์ Premium'); return; } S.focus = k; save(); render(); }
function findProgram(id){ return id === 'offset' ? buildOffset(totals().over || 80) : [...PROGRAMS, ...S.custom].find(p => p.id === id); }

function previewProgram(id){
  const p = findProgram(id), e = estimate(p);
  const grouped = []; p.rounds.forEach(r => { const g = grouped.find(x => x.id === r); g ? g.n++ : grouped.push({id:r, n:1}); });
  const locked = p.pro && !S.premium;
  sheet(`<div class="eyebrow">${esc(p.tag || 'ชดเชยแคลอรี')}</div><h2>${esc(p.n)}</h2>
    <div class="tiles"><div><b class="num">${e.min}</b><span class="small muted">นาที</span></div><div><b class="num">${fmt(e.burn)}</b><span class="small muted">kcal</span></div><div><b class="num">${p.rounds.length}</b><span class="small muted">ท่า</span></div></div>
    <div>${grouped.map((g, i) => { const x = exById(g.id); return `<button class="ex" onclick="exDetail('${x.id}')"><div class="idx num">${i + 1}</div><div style="flex:1"><div style="font-weight:500">${x.th}</div><div class="small muted">${x.n}</div></div><span class="small muted num">${g.n} รอบ</span></button>`; }).join('')}</div>
    ${p.mine ? `<button class="linkbtn" style="color:var(--coral)" onclick="delCustom('${p.id}')">ลบโปรแกรมนี้</button>` : ''}
    <div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">ปิด</button><button class="btn ${locked ? 'lime' : ''}" style="flex:2" onclick="startProgram('${p.id}')">${locked ? 'ปลดล็อกด้วย Premium' : 'เริ่มเลย'}</button></div>`);
}
function exDetail(id){
  const e = exById(id);
  sheet(`<div class="eyebrow">${e.n}</div><h2>${e.th}</h2>
    <div class="tiles"><div><b class="num">${e.met}</b><span class="small muted">MET</span></div><div><b class="num">${kcalPerMin(e.met).toFixed(1)}</b><span class="small muted">kcal/นาที</span></div><div><b class="num">${Math.round(kcalPerMin(e.met) * 0.67)}</b><span class="small muted">kcal/40 วิ</span></div></div>
    <div><div class="eyebrow" style="margin-bottom:4px">วิธีทำ</div><ol class="steps">${e.how.map(s => `<li>${s}</li>`).join('')}</ol></div>
    <div class="ok-banner small"><b>ท่าง่ายลง / ถนอมเข่า:</b> ${e.easy}</div>
    <div class="small muted">กล้ามเนื้อหลัก: ${e.mus}</div>
    <button class="btn ghost block" onclick="closeSheet()">ปิด</button>`);
}

let builderSel = [];
function openBuilder(){
  if (!S.premium){ paywall('สร้างโปรแกรมของตัวเองเป็นฟีเจอร์ Premium'); return; }
  builderSel = [];
  drawBuilder();
}
function drawBuilder(){
  sheet(`<h2>สร้างโปรแกรมของฉัน</h2><p class="small muted">แตะท่าตามลำดับที่ต้องการ แตะซ้ำได้</p>
    <label class="field"><span>ชื่อโปรแกรม</span><input id="bName" value="${esc($('#bName')?.value || 'โปรแกรมของฉัน')}"></label>
    <div class="card" style="padding:10px;min-height:52px">${builderSel.length ? `<div class="chips wrap" style="flex-wrap:wrap">${builderSel.map((id, i) => `<button class="chip on" onclick="builderSel.splice(${i},1);drawBuilder()">${i + 1}. ${exById(id).th} ✕</button>`).join('')}</div>` : '<span class="small faint">ยังไม่ได้เลือกท่า</span>'}</div>
    <div class="alts">${EX.map(e => `<button class="chip" onclick="builderSel.push('${e.id}');drawBuilder()">+ ${e.th}</button>`).join('')}</div>
    <div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">ยกเลิก</button><button class="btn" style="flex:2" ${builderSel.length < 3 ? 'disabled' : ''} onclick="saveBuilder()">บันทึก (${builderSel.length} ท่า)</button></div>`);
}
function saveBuilder(){
  const n = ($('#bName').value || 'โปรแกรมของฉัน').trim();
  S.custom.push({id:'c' + Date.now(), n, tag:'ของฉัน', color:'lime', mine:true, rounds:[...builderSel]});
  save(); closeSheet(); render(); toast('บันทึกโปรแกรมแล้ว');
}
function delCustom(id){ S.custom = S.custom.filter(p => p.id !== id); save(); closeSheet(); render(); }

/* ---------- Audio + voice cues ---------- */
let actx = null;
function beep(freq = 880, ms = 120){
  if (!S.settings.sound) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(.15, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + ms / 1000);
    o.start(); o.stop(actx.currentTime + ms / 1000);
  } catch(e){}
}
function say(text){
  if (!S.settings.voice || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'th-TH'; u.rate = 1.05; speechSynthesis.speak(u); } catch(e){}
}

/* ---------- Player ---------- */
let W = null;
function startProgram(id){
  const p = findProgram(id);
  if (p.pro && !S.premium){ paywall('โปรแกรมเฉพาะจุดเป็นฟีเจอร์ Premium'); return; }
  const L = level(), stretch = p.rest === false;
  const work = stretch ? 45 : L.work, rest = stretch ? 5 : L.rest;
  const steps = [{kind:'ready', e:exById(p.rounds[0]), s:5}];
  p.rounds.forEach((id, i) => {
    steps.push({kind:'work', e:exById(id), s:work});
    if (i < p.rounds.length - 1) steps.push({kind:'rest', e:exById(p.rounds[i + 1]), s:rest});
  });
  W = {p, steps, i:0, left:steps[0].s, paused:false, burned:0, done:0, total:steps.reduce((a, s) => a + s.s, 0)};
  try { navigator.wakeLock?.request('screen').then(l => W && (W.lock = l)).catch(() => {}); } catch(e){}
  beep(660); say(`เตรียมตัว ท่าแรก ${W.steps[0].e.th}`);
  drawPlayer();
  W.timer = setInterval(tick, 1000);
}
function enterStep(){
  const st = W.steps[W.i];
  W.left = st.s;
  if (st.kind === 'work'){ beep(990, 250); say(`เริ่ม ${st.e.th}`); }
  else if (st.kind === 'rest'){ beep(520, 250); say(`พัก ท่าต่อไป ${st.e.th}`); }
}
function tick(){
  if (!W || W.paused) return;
  const st = W.steps[W.i];
  W.left--; W.done++;
  W.burned += kcalPerMin(st.kind === 'work' ? st.e.met : 2.5) / 60;
  if (W.left > 0 && W.left <= 3) beep(760, 90);
  if (W.left <= 0){ W.i++; if (W.i >= W.steps.length){ finishWorkout(); return; } enterStep(); }
  drawPlayer();
}
function drawPlayer(){
  const st = W.steps[W.i];
  const works = W.steps.filter(s => s.kind === 'work');
  const idx = W.steps.slice(0, W.i + 1).filter(s => s.kind === 'work').length;
  const next = W.steps.slice(W.i + 1).find(s => s.kind === 'work');
  const label = {ready:'เตรียมตัว', work:'ออกแรง', rest:'พัก · ท่าต่อไป'}[st.kind];
  $('#overlay').innerHTML = `<div class="player ${st.kind}" role="dialog" aria-label="กำลังออกกำลังกาย">
    <div style="width:100%;max-width:400px" class="stack">
      <div class="row between small"><span class="num" style="opacity:.8">ท่า ${Math.max(1, idx)}/${works.length}</span>
        <span class="row" style="gap:6px"><button class="iconbtn" onclick="S.settings.voice=!S.settings.voice;save();drawPlayer()">${S.settings.voice ? 'เสียงพากย์ เปิด' : 'เสียงพากย์ ปิด'}</button><span class="num" style="opacity:.8">🔥 ${W.burned.toFixed(1)} kcal</span></span></div>
      <div class="bar"><i style="width:${W.done / W.total * 100}%"></i></div>
    </div>
    <div class="stack" style="align-items:center">
      <div class="phase">${label}</div>
      <div class="exname">${st.e.th}</div>
      <div class="small" style="opacity:.7">${st.e.n}</div>
      <div class="timer num" aria-live="off">${Math.floor(W.left / 60)}:${String(W.left % 60).padStart(2, '0')}</div>
      <div class="hint">${st.kind === 'work' ? st.e.how[1] : `${st.e.how[0]} · ง่ายลง: ${st.e.easy}`}</div>
      ${st.kind === 'work' && next ? `<div class="small" style="opacity:.6">ต่อไป: ${next.e.th}</div>` : ''}
    </div>
    <div class="ctl">
      <button class="btn ghost" onclick="prevStep()" aria-label="ท่าก่อนหน้า">‹</button>
      <button class="btn ghost" onclick="stopWorkout()">หยุด</button>
      <button class="btn lime" style="flex:2" onclick="W.paused=!W.paused;drawPlayer()">${W.paused ? 'เล่นต่อ' : 'หยุดชั่วคราว'}</button>
      <button class="btn ghost" onclick="skipStep()" aria-label="ข้าม">›</button>
    </div>
  </div>`;
}
function skipStep(){ W.done += W.left; W.i++; if (W.i >= W.steps.length){ finishWorkout(); return; } enterStep(); drawPlayer(); }
function prevStep(){
  let j = W.i - 1;
  while (j > 0 && W.steps[j].kind !== 'work') j--;
  if (j < 0) j = 0;
  W.done = Math.max(0, W.done - (W.steps[W.i].s - W.left) - W.steps.slice(j, W.i).reduce((a, s) => a + s.s, 0));
  W.i = j; enterStep(); drawPlayer();
}
function endTimer(){ clearInterval(W.timer); try { W.lock?.release(); speechSynthesis.cancel(); } catch(e){} }
function stopWorkout(){
  endTimer();
  const burned = Math.round(W.burned), mins = Math.max(1, Math.round(W.done / 60)), name = W.p.n;
  W = null;
  if (burned >= 5){ day().log.push({t:nowT(), kind:'workout', name:name + ' (บางส่วน)', burn:burned, min:mins}); award('wo1'); checkBadges(); save(); toast(`บันทึกการเผาผลาญ ${burned} kcal`); }
  closeSheet(); tab = 'home'; render();
}
function finishWorkout(){
  endTimer();
  const burned = Math.round(W.burned), mins = Math.round(W.total / 60), p = W.p;
  const overBefore = totals().over;
  day().log.push({t:nowT(), kind:'workout', name:p.n, burn:burned, min:mins, offset:!!p.offset});
  award('wo1');
  let coupon = null;
  if (p.offset && overBefore > 0){
    award('offset1');
    const pr = PARTNERS[S.coupons.length % PARTNERS.length];
    coupon = {shop:pr.n, deal:pr.deal, code:'FIT' + Math.random().toString(36).slice(2, 7).toUpperCase()};
    S.coupons.unshift(coupon);
  }
  checkBadges(); save(); W = null;
  beep(1040, 400); say('เยี่ยมมาก จบเซสชันแล้ว');
  $('#overlay').innerHTML = `<div class="player">
    <div></div>
    <div class="stack" style="align-items:center;gap:14px;width:100%;max-width:400px">
      <div class="phase">${p.offset ? 'ชดเชยสำเร็จ' : 'จบเซสชัน'}</div>
      <div class="timer num" style="font-size:72px">−${burned}</div>
      <div>kcal ใน ${mins} นาที · ${esc(p.n)}</div>
      ${coupon ? `<div class="coupon"><div class="small" style="font-weight:600">รางวัลจากร้านพาร์ทเนอร์</div><div style="font-family:var(--display);font-size:18px;font-weight:600">${coupon.shop}</div><div class="small">${coupon.deal}</div><div class="code num" style="margin-top:6px">${coupon.code}</div></div>` : ''}
      <div class="small" style="opacity:.75;margin-top:6px">รู้สึกอย่างไรกับความหนัก?</div>
      <div class="rpe">${[['easy','ง่ายไป'],['ok','พอดี'],['hard','หนักไป']].map(([k, v]) => `<button onclick="rate('${k}')">${v}</button>`).join('')}</div>
    </div>
    <div class="ctl"><button class="btn lime" onclick="closeSheet();go('home')">กลับหน้าหลัก</button></div>
  </div>`;
}
function rate(k){
  const i = LEVELS.findIndex(l => l.id === S.level);
  if (k === 'easy' && i < LEVELS.length - 1){ S.level = LEVELS[i + 1].id; toast(`ปรับความหนักเป็น "${LEVELS[i + 1].n}" ครั้งหน้า`); }
  else if (k === 'hard' && i > 0){ S.level = LEVELS[i - 1].id; toast(`ปรับความหนักเป็น "${LEVELS[i - 1].n}" ครั้งหน้า`); }
  else toast('ขอบคุณ ความหนักนี้เหมาะแล้ว');
  save();
  $$('.rpe button').forEach(b => b.classList.toggle('on', b.getAttribute('onclick').includes(`'${k}'`)));
}

/* ================= PROGRESS ================= */
function barChart(){
  const keys = Array.from({length:7}, (_, i) => addDays(TODAY, i - 6));
  const data = keys.map(k => ({k, ...totals(k)}));
  const goal = goalKcal();
  const W_ = 320, H = 160, pl = 34, pr = 6, pt = 10, pb = 22;
  const max = Math.ceil(Math.max(goal, ...data.map(d => d.net)) * 1.1 / 500) * 500;
  const y = v => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W_ - pl - pr) / 7;
  const ticks = []; for (let v = 0; v <= max; v += 500) ticks.push(v);
  return `<div class="chart" id="calChart"><svg viewBox="0 0 ${W_} ${H}" role="img" aria-label="แคลอรีสุทธิ 7 วันเทียบเป้าหมาย">
    ${ticks.map(v => `<line class="grid" x1="${pl}" x2="${W_ - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${v ? (v / 1000).toFixed(1) + 'k' : 0}</text>`).join('')}
    ${data.map((d, i) => { const x = pl + i * bw + bw * .22, w = bw * .56, v = Math.max(0, d.net), top = y(v); const r = Math.min(4, (y(0) - top) / 2);
      return `<path d="M${x},${y(0)} V${top + r} q0,-${r} ${r},-${r} h${w - 2 * r} q${r},0 ${r},${r} V${y(0)} Z" fill="${d.net > goal ? 'var(--coral)' : 'var(--good)'}"/>
      <text class="axis" x="${x + w / 2}" y="${H - 6}" text-anchor="middle" style="${d.k === TODAY ? 'font-weight:700;fill:var(--ink)' : ''}">${d.k === TODAY ? 'วันนี้' : dow(d.k)}</text>
      <rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" data-tip="${dow(d.k)} ${d.k.slice(8)}/${d.k.slice(5, 7)} · สุทธิ ${fmt(d.net)} kcal${d.net > goal ? ' (เกินเป้า)' : ''}${d.burn ? ` · เผา ${fmt(d.burn)}` : ''}"/>`; }).join('')}
    <line x1="${pl}" x2="${W_ - pr}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <text class="axis" x="${W_ - pr}" y="${y(goal) - 4}" text-anchor="end" style="fill:var(--ink)">เป้า ${fmt(goal)}</text>
  </svg></div>`;
}
function weightChart(){
  const ws = [...S.weights].sort((a, b) => a.d.localeCompare(b.d)).slice(-10);
  if (ws.length < 2) return `<p class="small muted">บันทึกน้ำหนักอย่างน้อย 2 ครั้งเพื่อดูกราฟ</p>`;
  const W_ = 320, H = 140, pl = 34, pr = 10, pt = 12, pb = 22;
  const vals = ws.map(w => w.kg), lo = Math.floor(Math.min(...vals) - .5), hi = Math.ceil(Math.max(...vals) + .5);
  const x = i => pl + (W_ - pl - pr) * i / (ws.length - 1), y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  const ticks = []; const step = hi - lo > 4 ? 2 : 1; for (let v = lo; v <= hi; v += step) ticks.push(v);
  const line = ws.map((w, i) => `${i ? 'L' : 'M'}${x(i)},${y(w.kg)}`).join(' ');
  const area = `${line} L${x(ws.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const last = ws[ws.length - 1];
  return `<div class="chart" id="wChart"><svg viewBox="0 0 ${W_} ${H}" role="img" aria-label="กราฟน้ำหนัก">
    ${ticks.map(v => `<line class="grid" x1="${pl}" x2="${W_ - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('')}
    <path d="${area}" fill="var(--good)" opacity=".12"/>
    <path d="${line}" fill="none" stroke="var(--good)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${ws.map((w, i) => `<circle cx="${x(i)}" cy="${y(w.kg)}" r="${i === ws.length - 1 ? 5 : 3}" fill="${i === ws.length - 1 ? 'var(--good)' : 'var(--surface)'}" stroke="var(--good)" stroke-width="2"/>
      <circle cx="${x(i)}" cy="${y(w.kg)}" r="14" fill="transparent" data-tip="${w.d.slice(8)}/${w.d.slice(5, 7)} · ${w.kg.toFixed(1)} กก."/>`).join('')}
    <text class="axis" x="${pl}" y="${H - 6}">${ws[0].d.slice(8)}/${ws[0].d.slice(5, 7)}</text>
    <text class="axis" x="${W_ - pr}" y="${H - 6}" text-anchor="end">${last.d.slice(8)}/${last.d.slice(5, 7)}</text>
  </svg></div>`;
}
function bindCharts(){
  $$('.chart').forEach(ch => {
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; ch.appendChild(tip);
    ch.querySelectorAll('[data-tip]').forEach(el => {
      const show = () => { const r = el.getBoundingClientRect(), c = ch.getBoundingClientRect(); tip.textContent = el.dataset.tip; tip.hidden = false; tip.style.left = Math.min(Math.max(r.left + r.width / 2 - c.left, 70), c.width - 70) + 'px'; tip.style.top = (r.top - c.top + (el.tagName === 'circle' ? r.height / 2 : 12)) + 'px'; };
      el.addEventListener('pointerenter', show); el.addEventListener('click', show);
      el.addEventListener('pointerleave', () => tip.hidden = true);
    });
  });
  const f = $('#wForm');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const kg = +$('#wIn').value;
    if (!(kg >= 30 && kg <= 250)) { toast('กรอกน้ำหนักระหว่าง 30–250 กก.'); return; }
    S.weights = S.weights.filter(w => w.d !== TODAY); S.weights.push({d:TODAY, kg}); S.profile.weight = kg;
    checkBadges(); save(); render(); toast('บันทึกน้ำหนักแล้ว');
  });
}
function viewProgress(){
  const st = streak(), wb = weekBurn();
  const keys = Array.from({length:7}, (_, i) => addDays(TODAY, i - 6));
  const inGoal = keys.filter(k => S.days[k] && totals(k).food > 0 && totals(k).net <= goalKcal()).length;
  const cal = Array.from({length:28}, (_, i) => addDays(TODAY, i - 27));
  const board = [...FRIENDS, {n:'คุณ', burn:Math.round(wb), av:'⭐', me:true}].sort((a, b) => b.burn - a.burn);
  const top = board[0].burn || 1;
  const ws = [...S.weights].sort((a, b) => a.d.localeCompare(b.d));
  const delta = ws.length > 1 ? ws[ws.length - 1].kg - ws[0].kg : 0;
  return `
  <div><h2>ความคืบหน้า</h2><p class="small muted">7 วันล่าสุด</p></div>
  <section class="tiles">
    <div><b class="num">${st}</b><span class="small muted">วันติดต่อกัน</span></div>
    <div><b class="num">${fmt(wb)}</b><span class="small muted">kcal ที่เผาผลาญ</span></div>
    <div><b class="num">${inGoal}/7</b><span class="small muted">วันอยู่ในเป้า</span></div>
  </section>
  <section class="card stack">
    <div class="sec-head"><h3>แคลอรีสุทธิรายวัน</h3><span class="tiny faint">แตะแท่งเพื่อดูตัวเลข</span></div>
    ${barChart()}
    <div class="row small muted" style="gap:14px"><span class="row" style="gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:var(--good);display:inline-block"></i>อยู่ในเป้า</span><span class="row" style="gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:var(--coral);display:inline-block"></i>เกินเป้า</span></div>
  </section>
  <section class="card stack">
    <div class="sec-head"><h3>น้ำหนัก</h3>${ws.length > 1 ? `<span class="small num" style="color:${delta <= 0 ? 'var(--good)' : 'var(--coral)'}">${delta <= 0 ? '▼' : '▲'} ${Math.abs(delta).toFixed(1)} กก.</span>` : ''}</div>
    ${weightChart()}
    <form class="row" id="wForm"><div class="search" style="flex:1"><input id="wIn" type="number" step="0.1" min="30" max="250" placeholder="น้ำหนักวันนี้ (กก.)" aria-label="น้ำหนักวันนี้"></div><button class="btn sm" type="submit" style="padding:12px 16px">บันทึก</button></form>
  </section>
  <section class="card stack">
    <div class="sec-head"><h3>ปฏิทินออกกำลังกาย</h3><span class="tiny faint">28 วัน</span></div>
    <div class="cal">${cal.map(k => `<div class="d${(S.days[k]?.log || []).some(l => l.kind === 'workout') ? ' hit' : ''}${k === TODAY ? ' today' : ''}" title="${k}">${+k.slice(8)}</div>`).join('')}</div>
  </section>
  <section class="card stack">
    <div class="sec-head"><h3>ชาเลนจ์เพื่อนสัปดาห์นี้</h3><span class="tiny faint">kcal ที่เผาผลาญ</span></div>
    <div>${board.map((b, i) => `<div class="lb${b.me ? ' me' : ''}"><span class="rank num">${i + 1}</span><span class="av">${b.av}</span><div style="flex:1;min-width:0" class="stack"><div class="row between small" style="gap:6px"><b>${b.n}</b><span class="num">${fmt(b.burn)}</span></div><div class="bar2"><i style="width:${b.burn / top * 100}%"></i></div></div></div>`).join('')}</div>
    <p class="demo-note" style="text-align:left">รายชื่อเพื่อนเป็นข้อมูลตัวอย่าง</p>
  </section>
  <section class="card stack">
    <div class="sec-head"><h3>เหรียญรางวัล</h3><span class="small muted num">${Object.keys(S.badges).length}/${BADGES.length}</span></div>
    <div class="badges">${BADGES.map(b => `<div class="badge${S.badges[b.id] ? '' : ' locked'}" title="${b.d}"><span class="i">${b.i}</span><span class="n">${b.n}</span><span class="tiny faint">${b.d}</span></div>`).join('')}</div>
  </section>`;
}

/* ================= PROFILE ================= */
function viewMe(){
  const p = S.profile, MT = macroTargets();
  return `
  <div><h2>โปรไฟล์</h2></div>
  <section class="card stack">
    <div class="sec-head"><div><b>${esc(p.name)}</b><div class="small muted">${p.sex === 'm' ? 'ชาย' : 'หญิง'} · ${p.age} ปี · ${p.height} ซม. · ${p.weight} กก.</div></div><button class="btn ghost sm" onclick="openOnboarding()">แก้ไข</button></div>
    <div class="tiles"><div><b class="num">${fmt(bmr())}</b><span class="small muted">BMR</span></div><div><b class="num">${fmt(tdee())}</b><span class="small muted">TDEE</span></div><div><b class="num">${fmt(goalKcal())}</b><span class="small muted">เป้า/วัน</span></div></div>
    <div class="small muted">เป้าหมาย: <b style="color:var(--ink)">${GOALS.find(g => g.id === p.goal).n}</b> · สารอาหาร/วัน: โปรตีน ${MT[0]} ก. · คาร์บ ${MT[1]} ก. · ไขมัน ${MT[2]} ก.</div>
  </section>
  <section class="stack">
    <div class="plan">
      <div class="row between"><h3>Free</h3>${!S.premium ? '<span class="pill">แพ็กเกจปัจจุบัน</span>' : ''}</div>
      <div class="price num">0 ฿</div>
      <ul class="small"><li>สแกนอาหารด้วย AI 5 มื้อ/วัน</li><li>เวิร์กเอาต์ชดเชยแบบทั้งตัว + โปรแกรมพื้นฐาน</li></ul>
    </div>
    <div class="plan pro">
      <div class="row between"><h3 style="color:var(--lime)">Premium</h3>${S.premium ? '<span class="pill pro">แพ็กเกจปัจจุบัน</span>' : ''}</div>
      <div class="price num">89 ฿<span class="small" style="font-weight:400;opacity:.7"> / เดือน</span></div>
      <ul class="small"><li>สแกนอาหารไม่จำกัด</li><li>เวิร์กเอาต์ชดเชยเฉพาะจุด: หน้าท้อง ต้นขา แขน</li><li>โปรแกรมพิเศษ + สร้างโปรแกรมเอง</li><li>คูปองอาหารคลีนจากร้านพาร์ทเนอร์</li></ul>
      <button class="btn ${S.premium ? 'ghost' : 'lime'} block" style="margin-top:12px;${S.premium ? 'color:var(--ground);border-color:rgba(127,127,127,.5)' : ''}" onclick="togglePremium()">${S.premium ? 'ยกเลิก Premium (เดโม)' : 'อัปเกรด Premium (เดโม)'}</button>
    </div>
  </section>
  <section class="card stack">
    <h3>การตั้งค่า</h3>
    <label class="switch"><span>เสียงพากย์ภาษาไทยระหว่างออกกำลังกาย</span><input type="checkbox" id="setVoice" ${S.settings.voice ? 'checked' : ''} onchange="S.settings.voice=this.checked;save()"></label>
    <label class="switch"><span>เสียงบี๊บนับถอยหลัง</span><input type="checkbox" id="setSound" ${S.settings.sound ? 'checked' : ''} onchange="S.settings.sound=this.checked;save()"></label>
    <label class="field"><span>ธีม</span><select id="setTheme" onchange="S.settings.theme=this.value;save();applyTheme()">${[['auto','ตามระบบ'],['light','สว่าง'],['dark','มืด']].map(([k, v]) => `<option value="${k}" ${S.settings.theme === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  </section>
  <section class="card stack">
    <h3>ชวนเพื่อน รับ Premium ฟรี 1 เดือน</h3>
    <div class="row"><div class="search" style="flex:1"><input id="ref" readonly value="ONEFIT-${esc(p.name).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'FRIEND'}89" aria-label="โค้ดชวนเพื่อน"></div><button class="btn ghost" onclick="copyRef()">คัดลอก</button></div>
  </section>
  <section class="card stack">
    <h3>คูปองของฉัน</h3>
    ${S.coupons.length ? S.coupons.map(c => `<div class="row between"><div><b>${esc(c.shop)}</b><div class="small muted">${esc(c.deal)}</div></div><span class="pill num">${c.code}</span></div>`).join('') : '<p class="small muted">ทำเวิร์กเอาต์ชดเชยให้ครบ เพื่อรับคูปองจากร้านพาร์ทเนอร์</p>'}
  </section>
  <div class="row"><button class="btn ghost" style="flex:1" onclick="resetDemo()">โหลดข้อมูลตัวอย่าง</button><button class="btn ghost" style="flex:1;color:var(--coral)" onclick="confirmWipe()">ลบข้อมูลทั้งหมด</button></div>
  <p class="demo-note">OneFit demo · ไม่มีการชำระเงินจริง ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น</p>`;
}
function togglePremium(){ S.premium = !S.premium; if (!S.premium) S.focus = 'full'; save(); render(); toast(S.premium ? 'เปิดใช้ Premium แล้ว (เดโม)' : 'กลับเป็นแพ็กเกจ Free'); }
function copyRef(){ const i = $('#ref'); try { navigator.clipboard.writeText(i.value).then(() => toast('คัดลอกโค้ดแล้ว'), () => i.select()); } catch(e){ i.select(); } }
function resetDemo(){ S = seed(); save(); tab = 'home'; render(); toast('โหลดข้อมูลตัวอย่างแล้ว'); }
function confirmWipe(){
  sheet(`<h2>ลบข้อมูลทั้งหมด?</h2><p class="muted">มื้ออาหาร เวิร์กเอาต์ น้ำหนัก และเหรียญรางวัลจะหายทั้งหมด แล้วเริ่มตั้งค่าโปรไฟล์ใหม่</p>
    <div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">ยกเลิก</button><button class="btn coral" style="flex:1" onclick="S=blank();save();closeSheet();tab='home';render();openOnboarding()">ลบข้อมูล</button></div>`);
}
function paywall(reason){
  sheet(`<div class="eyebrow">OneFit Premium</div><h2>${reason}</h2>
    <p class="muted">อัปเกรดเพื่อสแกนอาหารไม่จำกัด เลือกเวิร์กเอาต์เฉพาะจุด และสร้างโปรแกรมของตัวเอง</p>
    <div class="plan pro"><div class="price num">89 ฿<span class="small" style="font-weight:400;opacity:.7"> / เดือน</span></div><div class="small" style="opacity:.8">หรือชวนเพื่อน 1 คน ใช้ฟรี 1 เดือน</div></div>
    <div class="row"><button class="btn ghost" style="flex:1" onclick="closeSheet()">ไว้ก่อน</button><button class="btn lime" style="flex:2" onclick="S.premium=true;save();closeSheet();render();toast('เปิดใช้ Premium แล้ว (เดโม)')">อัปเกรด (เดโม)</button></div>`);
}

/* ================= ONBOARDING ================= */
let ob = null;
function openOnboarding(){ ob = {step:0, p:{...S.profile}}; drawOnb(); }
function drawOnb(){
  const p = ob.p, st = ob.step;
  const steps = [
    () => `<h2>มาทำความรู้จักกัน</h2><p class="muted">ใช้คำนวณพลังงานที่ร่างกายใช้ต่อวัน</p>
      <label class="field"><span>ชื่อเล่น</span><input id="oName" value="${esc(p.name)}" maxlength="20"></label>
      <div class="field"><span>เพศ (สำหรับสูตรคำนวณ)</span><div class="seg"><button class="${p.sex === 'f' ? 'on' : ''}" onclick="obSet('sex','f')">หญิง</button><button class="${p.sex === 'm' ? 'on' : ''}" onclick="obSet('sex','m')">ชาย</button></div></div>
      <label class="field"><span>อายุ (ปี)</span><input id="oAge" type="number" min="13" max="90" value="${p.age}"></label>`,
    () => `<h2>ส่วนสูงและน้ำหนัก</h2>
      <div class="two"><label class="field"><span>ส่วนสูง (ซม.)</span><input id="oH" type="number" min="120" max="230" value="${p.height}"></label>
      <label class="field"><span>น้ำหนัก (กก.)</span><input id="oW" type="number" step="0.1" min="30" max="250" value="${p.weight}"></label></div>
      <p class="small muted">BMI ปัจจุบัน <b class="num" style="color:var(--ink)">${(p.weight / (p.height / 100) ** 2).toFixed(1)}</b></p>`,
    () => `<h2>ปกติขยับตัวแค่ไหน?</h2><div class="opts">${ACTIVITY.map(a => `<button class="opt${p.activity === a.id ? ' on' : ''}" onclick="obSet('activity',${a.id})">${a.n}</button>`).join('')}</div>`,
    () => `<h2>เป้าหมายของคุณ</h2><div class="opts">${GOALS.map(g => `<button class="opt${p.goal === g.id ? ' on' : ''}" onclick="obSet('goal','${g.id}')">${g.n}<div class="small muted">${g.adj ? (g.adj > 0 ? '+' : '') + g.adj + ' kcal จาก TDEE' : 'เท่ากับ TDEE'}</div></button>`).join('')}</div>
      <div class="tdee"><span class="small" style="opacity:.75">เป้าหมายแคลอรีต่อวัน</span><b class="num">${fmt(goalKcal(p))} kcal</b><span class="small" style="opacity:.75">BMR ${fmt(bmr(p))} · TDEE ${fmt(tdee(p))} (สูตร Mifflin-St Jeor)</span></div>`,
  ];
  $('#overlay').innerHTML = `<div class="onb"><div class="inner">
    <div class="row between"><div class="brand">One<span>Fit</span></div>${S.onboarded ? '<button class="linkbtn" onclick="closeSheet()">ปิด</button>' : ''}</div>
    <div class="dots">${steps.map((_, i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>
    <div class="stack" style="gap:14px">${steps[st]()}</div>
    <div class="row" style="margin-top:auto">${st ? '<button class="btn ghost" style="flex:1" onclick="obMove(-1)">ย้อนกลับ</button>' : ''}<button class="btn" style="flex:2" onclick="obMove(1)">${st === steps.length - 1 ? 'เริ่มใช้ OneFit' : 'ถัดไป'}</button></div>
  </div></div>`;
}
function obRead(){
  const v = (id, lo, hi) => { const el = $(id); if (!el) return undefined; const n = +el.value; return n >= lo && n <= hi ? n : undefined; };
  if ($('#oName')) ob.p.name = $('#oName').value.trim() || 'เพื่อน';
  ob.p.age = v('#oAge', 13, 90) ?? ob.p.age;
  ob.p.height = v('#oH', 120, 230) ?? ob.p.height;
  ob.p.weight = v('#oW', 30, 250) ?? ob.p.weight;
}
function obSet(k, val){ obRead(); ob.p[k] = val; drawOnb(); }
function obMove(d){
  obRead();
  ob.step += d;
  if (ob.step >= 4){
    const wChanged = ob.p.weight !== S.profile.weight;
    S.profile = ob.p; S.onboarded = true;
    if (wChanged || !S.weights.length){ S.weights = S.weights.filter(w => w.d !== TODAY); S.weights.push({d:TODAY, kg:ob.p.weight}); }
    save(); closeSheet(); render(); toast(`ตั้งเป้าหมาย ${fmt(goalKcal())} kcal/วันแล้ว`); return;
  }
  drawOnb();
}

/* ---------- Boot ---------- */
$$('#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
if (location.hash && TABS.includes(location.hash.slice(1))) tab = location.hash.slice(1);
render();
if (!S.onboarded) openOnboarding();
if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname.endsWith('github.io')){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
