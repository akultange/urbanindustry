import { createScene } from './scene.js';
import { createReel } from './reel.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const catalog = JSON.parse($('#catalog').textContent);
const pairs = catalog.pairs;
const ASSET = window.__ASSET_BASE || 'assets/';
const IG = 'https://ig.me/m/urbanindustry_';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phoneQ = matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px) and (orientation: portrait)');
const pad2 = n => String(n).padStart(2, '0');

// ---------------------------------------------------------------- copy
const T = {
  ka: {
    skip: 'წყვილების სიაზე გადასვლა', navWall: 'კედელი', navAbout: 'ჩვენ შესახებ', bag: 'კალათა',
    h1: 'Urban Industry — სნიკერები თბილისიდან',
    status: 'კედელი 01 / 10 წყვილი', hint: 'გადაატარე კურსორი — აინთება. დააჭირე — ჩამოიღე თაროდან.', hintTouch: 'გადაუყევი კედელს. შეეხე წყვილს.',
    pNote: 'კედელი 01 / ფეხსაცმელი', chooseSize: 'აირჩიე ზომა', orderDirect: 'შეკვეთა Direct-ში', pickSize: 'ჯერ ზომა აირჩიე',
    sizeReady: s => `ზომა ${s} · შეკვეთა დაკოპირდება`, addBag: 'კალათაში დამატება', fromFeed: 'ჩვენი გვერდიდან',
    details: 'ზომები და მიწოდება', detailsText: 'ზომები ევროპულია (EU). ზუსტად არ იცი შენი? მოგვწერე Direct-ში, რა ზომას ატარებ ჩვეულებრივ. ვაგზავნით მთელ მსოფლიოში.',
    back: 'კედელზე დაბრუნება', sizesOrder: 'ზომები და შეკვეთა', bagTitle: 'შენი კალათა', bagEmpty: 'კალათა ცარიელია. აანთე რომელიმე წყვილი.',
    total: 'ჯამი', sendDirect: 'შეკვეთის გაგზავნა Direct-ში', sendHint: 'შეკვეთა დაკოპირდება — ჩასვი ჩატში', orMessenger: 'ან Messenger-ით',
    confirm: 'მარაგს, ფასს და მიწოდებას ჩატში დაგიდასტურებთ.', aboutKicker: 'Urban Industry / თბილისი',
    aboutTitle: 'სნიკერების კედელი, რომელსაც გაუყვები.', aboutLead: 'სნიკერების მაღაზია თბილისიდან — 144 ათასი ადამიანი Instagram-ზე. ვაგზავნით მთელ მსოფლიოში.',
    aboutText: 'აქ ყველა წყვილი ჩვენი გვერდიდანაა. აირჩიე წყვილი და ზომა, შეკვეთა კი Direct-ში დაასრულე — მარაგს, ფასს და მიწოდებას იქვე დაგიდასტურებთ.',
    step1: 'აირჩიე წყვილი და ზომა.', step2: 'დააჭირე „შეკვეთა Direct-ში“ — შეკვეთა დაკოპირდება.', step3: 'ჩასვი ჩატში. დაგიდასტურებთ და გამოგიგზავნით.',
    bags: 'ჩანთები', concept: 'საიტის კონცეფცია: ლუკა სხილაძე. ფასები საორიენტაციოა.',
    copied: 'შეკვეთა დაკოპირდა — ჩასვი ჩატში', added: 'კალათაში დაემატა', pickFirst: 'ჯერ ზომა აირჩიე', soldOut: 'ამოიწურა', remove: 'წაშლა',
    msg: (lines, total) => `გამარჯობა! მინდა შევუკვეთო:\n${lines}${total ? `\nჯამი: ${total} ₾` : ''}\n(urbanindustry საიტიდან)`,
    line: (p, s) => `${p.brand} ${p.model} (${p.color.ka}), ზომა ${s} — ${p.price} ₾`,
    title: 'Urban Industry — სნიკერები, თბილისი', size: 'ზომა',
  },
  en: {
    skip: 'Skip to the pairs', navWall: 'Wall', navAbout: 'About', bag: 'Bag',
    h1: 'Urban Industry — sneakers from Tbilisi',
    status: 'Wall 01 / 10 pairs', hint: 'Hover to light it. Click to take it off the shelf.', hintTouch: 'Swipe along the wall. Tap a pair.',
    pNote: 'Wall 01 / Footwear', chooseSize: 'Choose your size', orderDirect: 'Order in Direct', pickSize: 'Pick your size first',
    sizeReady: s => `EU ${s} · your order gets copied`, addBag: 'Add to bag', fromFeed: 'From our feed',
    details: 'Sizing & delivery', detailsText: 'EU sizing. Not sure about yours? Tell us the size you usually wear in Direct. We ship worldwide.',
    back: 'Back to the wall', sizesOrder: 'Sizes & order', bagTitle: 'Your bag', bagEmpty: 'Your bag is empty. Light up a pair.',
    total: 'Total', sendDirect: 'Send the order in Direct', sendHint: 'Your order is copied — paste it in the chat', orMessenger: 'or via Messenger',
    confirm: 'We confirm stock, price and delivery in the chat.', aboutKicker: 'Urban Industry / Tbilisi',
    aboutTitle: 'A sneaker wall you can walk along.', aboutLead: 'A sneaker store from Tbilisi with 144K people on Instagram. We ship worldwide.',
    aboutText: 'Every pair here comes straight from our feed. Pick one, choose your size and finish the order with us in Direct — we confirm stock, price and delivery right there.',
    step1: 'Pick a pair and your size.', step2: 'Tap “Order in Direct” — your order is copied.', step3: 'Paste it in the chat. We confirm and ship.',
    bags: 'Bags', concept: 'Concept site by Luka Skhiladze. Prices are indicative.',
    copied: 'Order copied — paste it in the chat', added: 'Added to your bag', pickFirst: 'Pick your size first', soldOut: 'Sold out', remove: 'Remove',
    msg: (lines, total) => `Hi! I'd like to order:\n${lines}${total ? `\nTotal: ${total} ₾` : ''}\n(from the urbanindustry site)`,
    line: (p, s) => `${p.brand} ${p.model} (${p.color.en}), EU ${s} — ${p.price} ₾`,
    title: 'Urban Industry — sneakers, Tbilisi', size: 'Size',
  },
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('ui.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ui.' + k, JSON.stringify(v)); } catch (e) {} },
};
const urlLang = new URLSearchParams(location.search).get('lang');
let lang = urlLang === 'en' || urlLang === 'ka' ? urlLang : store.get('lang', 'ka');
const t = (k, ...a) => { const v = T[lang][k]; return typeof v === 'function' ? v(...a) : v; };

function applyLang() {
  html.lang = lang;
  document.title = t('title');
  $$('[data-i18n]').forEach(el => { const v = t(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  buildLabels(); buildList();
  if (current >= 0) fillProduct(current);
  renderBag(); updateWalkbar(true);
}
$$('.lang button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('lang', lang); applyLang(); }));

// ---------------------------------------------------------------- helpers
const gel = n => `${n}<span class="gel"> ₾</span>`;
const img = (id, size) => `${ASSET}shoes/${id}-${size}.webp`;
const photo = (n, thumb) => `${ASSET}photos/${n}${thumb ? '-t' : ''}.webp`;
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
let toastT = 0;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}

// ---------------------------------------------------------------- scene
const canvas = $('#gl');
let phone = phoneQ.matches;
let scene = null;

// ---------------------------------------------------------------- labels (desktop, shown for the lit shelf)
const labelsEl = $('#labels');
let labelEls = [];
function buildLabels() {
  labelsEl.innerHTML = '';
  labelEls = pairs.map((p, i) => {
    const d = document.createElement('div'); d.className = 'lbl';
    d.innerHTML = `<span class="idx">${pad2(i + 1)}</span><b>${p.model}</b><span>${p.brand} · ${p.price} ₾</span>`;
    labelsEl.append(d); return d;
  });
}
let hoverI = -1;
function syncOverlay(s) {
  if (phone || current >= 0) return;
  for (let i = 0; i < labelEls.length; i++) {
    const el = labelEls[i];
    const on = i === hoverI;
    if (on) {
      const p = s.labelPoint(i);
      if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + 6)}px) translate(-50%, 0)`;
    }
    el.classList.toggle('on', on);
  }
}

// ---------------------------------------------------------------- accessible list + fallback grid
function buildList() {
  const nav = $('#pairs-list'); nav.innerHTML = '';
  pairs.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = html.classList.contains('no-gl')
      ? `<img src="${img(p.id, 512)}" alt="" loading="lazy"><span class="kicker">${pad2(i + 1)} / ${p.brand}</span><b>${p.model}</b><span>${p.price} ₾</span>`
      : `${pad2(i + 1)} ${p.brand} ${p.model} — ${p.price} ₾`;
    b.addEventListener('click', () => open(i));
    nav.append(b);
  });
}

// ---------------------------------------------------------------- product view
let current = -1, picked = null;
const productEl = $('#product');
function fillProduct(i) {
  const p = pairs[i];
  $('#p-kicker').textContent = `${pad2(i + 1)} / ${p.brand}`;
  $('#p-title').textContent = p.model;
  $('#p-desc').textContent = p.desc[lang];
  $('#p-color').textContent = p.color[lang];
  $('#p-price').innerHTML = gel(p.price);
  $('#pm-kicker').textContent = `${pad2(i + 1)} / ${p.brand}`;
  $('#pm-title').textContent = p.model;
  $('#pm-price').innerHTML = gel(p.price);
  const sizes = $('#sizes'); sizes.innerHTML = '';
  for (const s of p.sizes) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'size'; b.textContent = s; b.setAttribute('role', 'radio');
    const out = p.soldOut.includes(s);
    b.disabled = out; b.setAttribute('aria-checked', String(picked === s));
    b.setAttribute('aria-label', out ? `${t('size')} ${s}, ${t('soldOut')}` : `${t('size')} ${s}`);
    b.addEventListener('click', () => { picked = s; fillProduct(i); });
    sizes.append(b);
  }
  const order = $('#order');
  const ready = picked != null;
  order.classList.toggle('ready', ready);
  order.setAttribute('aria-disabled', String(!ready));
  $('#order-hint').textContent = ready ? t('sizeReady', picked) : t('pickSize');
  const th = $('#thumbs'); th.innerHTML = '';
  p.photos.forEach((ph, k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'thumb';
    b.setAttribute('aria-label', `${p.model} — photo ${k + 1}`);
    b.innerHTML = `<img src="${photo(ph.src, true)}" alt="" loading="lazy" decoding="async">`;
    b.addEventListener('click', () => openLightbox(p, k));
    th.append(b);
  });
  const prev = (i - 1 + pairs.length) % pairs.length, next = (i + 1) % pairs.length;
  $('#prev-label').textContent = `${pad2(prev + 1)} ${pairs[prev].model}`;
  $('#next-label').textContent = `${pad2(next + 1)} ${pairs[next].model}`;
}
function open(i, { push = true } = {}) {
  if (i < 0 || i >= pairs.length) return;
  const changed = current !== i;
  if (changed) picked = null;
  current = i;
  fillProduct(i);
  productEl.classList.add('open'); productEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('focused');
  if (phone) { document.body.classList.add('sheet-open'); if (scene) { scene.walkTo(i); scene.sheet(true); } }
  if (scene) { scene.focus(i); scene.hover(-1); }
  hiRes(i); hiRes((i + 1) % pairs.length); hiRes((i - 1 + pairs.length) % pairs.length);
  if (push && location.hash !== `#/p/${pairs[i].id}`) history.pushState({ p: pairs[i].id }, '', `#/p/${pairs[i].id}`);
  if (!phone) setTimeout(() => { if (current === i) $('#sizes .size:not(:disabled)')?.focus({ preventScroll: true }); }, 700);
}
function close({ push = true } = {}) {
  if (current < 0) return;
  current = -1; picked = null;
  productEl.classList.remove('open'); productEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('focused', 'sheet-open');
  if (scene && !phone) scene.focus(-1);
  if (scene && phone) { scene.state.focus = -1; scene.sheet(false); }
  if (push && location.hash.startsWith('#/p/')) history.pushState({}, '', '#/');
}
function step(d) {
  if (current < 0) return;
  const n = (current + d + pairs.length) % pairs.length;
  open(n, { push: false });
  history.replaceState({ p: pairs[n].id }, '', `#/p/${pairs[n].id}`);
}
$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
$('#back').addEventListener('click', () => close());
$('#sheet-grip').addEventListener('click', () => close());

// order in Direct: copy the order text, then let the link open Instagram
$('#order').addEventListener('click', async e => {
  if (current < 0) return;
  const p = pairs[current];
  if (picked == null) { e.preventDefault(); toast(t('pickFirst')); $('#sizes').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
  const ok = await copy(t('msg', t('line', p, picked)));
  toast(ok ? t('copied') : t('msg', t('line', p, picked)).split('\n')[1]);
});
$('#messenger').addEventListener('click', async () => {
  if (current < 0 || picked == null) return;
  const p = pairs[current];
  if (await copy(t('msg', t('line', p, picked)))) toast(t('copied'));
});

// ---------------------------------------------------------------- bag
let bag = store.get('bag', []);
function renderBag() {
  bag = bag.filter(b => pairs.some(p => p.id === b.id));
  $('#bag-count').textContent = pad2(bag.length);
  const ul = $('#bag-items'); ul.innerHTML = '';
  let total = 0;
  bag.forEach((b, k) => {
    const p = pairs.find(x => x.id === b.id); total += p.price;
    const li = document.createElement('li');
    li.innerHTML = `<img src="${img(p.id, 512)}" alt=""><div><b>${p.model}</b><small>${p.brand} · EU ${b.size}</small><button type="button" class="rm">${t('remove')}</button></div><span class="pr">${p.price} ₾</span>`;
    li.querySelector('.rm').addEventListener('click', () => { bag.splice(k, 1); store.set('bag', bag); renderBag(); });
    ul.append(li);
  });
  $('#bag-total').textContent = `${total} ₾`;
  $('#bag').classList.toggle('empty', bag.length === 0);
}
$('#add-bag').addEventListener('click', () => {
  if (current < 0) return;
  if (picked == null) { toast(t('pickFirst')); return; }
  bag.push({ id: pairs[current].id, size: picked }); store.set('bag', bag); renderBag();
  const btn = $('#bag-btn'); btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
  toast(t('added'));
});
function bagMessage() {
  const lines = bag.map(b => t('line', pairs.find(p => p.id === b.id), b.size)).join('\n');
  const total = bag.reduce((s, b) => s + pairs.find(p => p.id === b.id).price, 0);
  return t('msg', lines, bag.length > 1 ? total : 0);
}
$('#bag-send').addEventListener('click', async () => { if (await copy(bagMessage())) toast(t('copied')); });
$('#bag-msgr').addEventListener('click', async () => { if (await copy(bagMessage())) toast(t('copied')); });

// ---------------------------------------------------------------- overlays
let lastFocus = null;
function openLayer(id) {
  lastFocus = document.activeElement;
  const el = $('#' + id); el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.querySelector('.close')?.focus({ preventScroll: true }), 60);
  if (id === 'about') $$('.nav button').forEach(b => b.classList.toggle('is-on', b.dataset.go === 'about'));
}
function closeLayer(id) {
  const el = $('#' + id); if (!el.classList.contains('open')) return false;
  el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
  if (id === 'about') $$('.nav button').forEach(b => b.classList.toggle('is-on', b.dataset.go === 'wall'));
  lastFocus?.focus?.({ preventScroll: true });
  return true;
}
$('#bag-btn').addEventListener('click', () => { renderBag(); openLayer('bag'); });
$$('[data-close]').forEach(b => b.addEventListener('click', () => closeLayer(b.dataset.close)));
$$('.nav button').forEach(b => b.addEventListener('click', () => { if (b.dataset.go === 'about') openLayer('about'); else { closeLayer('about'); close(); } }));
$('.brand').addEventListener('click', e => { e.preventDefault(); closeLayer('about'); closeLayer('bag'); close(); });

let lb = null;
function openLightbox(p, k) { lb = { p, k }; showLb(); openLayer('lightbox'); }
function showLb() {
  const { p, k } = lb; const ph = p.photos[k];
  const im = $('#lb-img'); im.src = photo(ph.src); im.alt = `${p.brand} ${p.model}`;
  $('#lb-count').textContent = `${pad2(k + 1)} / ${pad2(p.photos.length)}`;
  $('#lb-prev').hidden = $('#lb-next').hidden = p.photos.length < 2;
}
$('#lb-prev').addEventListener('click', () => { lb.k = (lb.k - 1 + lb.p.photos.length) % lb.p.photos.length; showLb(); });
$('#lb-next').addEventListener('click', () => { lb.k = (lb.k + 1) % lb.p.photos.length; showLb(); });
$('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLayer('lightbox'); });

addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (closeLayer('lightbox') || closeLayer('bag') || closeLayer('about')) return;
    if (current >= 0) close();
    return;
  }
  if ($('#lightbox').classList.contains('open')) {
    if (e.key === 'ArrowLeft') $('#lb-prev').click(); if (e.key === 'ArrowRight') $('#lb-next').click(); return;
  }
  if (current >= 0 && !e.target.closest?.('input,textarea')) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  } else if (scene && !phone && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    hoverI = hoverI < 0 ? 0 : (hoverI + (e.key === 'ArrowRight' ? 1 : -1) + pairs.length) % pairs.length;
    scene.hover(hoverI);
  } else if (e.key === 'Enter' && hoverI >= 0 && current < 0 && document.activeElement === document.body) open(hoverI);
});

// ---------------------------------------------------------------- pointer on the wall
let down = null;
canvas.addEventListener('pointermove', e => {
  if (!scene) return;
  if (phone) { if (down) dragMove(e); return; }
  scene.pointer(e.clientX, e.clientY, true);
  if (current >= 0) return;
  const i = scene.pick(e.clientX, e.clientY);
  if (i !== hoverI) { hoverI = i; scene.hover(i); canvas.style.cursor = i >= 0 ? 'pointer' : ''; }
});
canvas.addEventListener('pointerleave', () => { if (!scene || phone) return; scene.pointer(0, 0, false); if (current < 0) { hoverI = -1; scene.hover(-1); } });
canvas.addEventListener('click', e => {
  if (!scene || phone) return;
  if (current >= 0) {
    // clicking the wall around the focused pair returns; clicking the pair itself does nothing
    const r = scene.shoeScreenRect(current);
    if (!r || e.clientX < r.x0 - 30 || e.clientX > r.x1 + 30 || e.clientY < r.y0 - 30 || e.clientY > r.y1 + 30) close();
    return;
  }
  const i = scene.pick(e.clientX, e.clientY);
  if (i >= 0) open(i);
});

// phone: swipe along the wall, tap to open
let lastX = 0, lastT = 0, vel = 0, moved = 0;
canvas.addEventListener('pointerdown', e => {
  if (!scene || !phone) return;
  down = { x: e.clientX, y: e.clientY, id: e.pointerId }; lastX = e.clientX; lastT = performance.now(); vel = 0; moved = 0;
  canvas.setPointerCapture(e.pointerId);
  scene.pointer(e.clientX, e.clientY, true);
});
function dragMove(e) {
  const now = performance.now(), dx = e.clientX - lastX;
  moved += Math.abs(dx);
  if (moved > 6) { scene.walkDrag(dx, false); if (current >= 0) close(); }
  vel = vel * 0.6 + (dx / Math.max(1, now - lastT)) * 1000 * 0.4;
  lastX = e.clientX; lastT = now;
  scene.pointer(e.clientX, e.clientY, true);
}
const endDrag = e => {
  if (!down || !scene) return;
  const tap = moved < 8;
  down = null;
  if (tap) {
    const i = scene.pick(e.clientX, e.clientY);
    if (i >= 0) { if (i !== scene.walkIndex()) scene.walkTo(i); else open(i); }
  } else scene.walkDrag(0, true, vel);
  setTimeout(() => scene.pointer(0, 0, false), 900);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// phone: the bar shows the pair you're standing at
const dots = $('#dots');
let wbIndex = -1;
function updateWalkbar(force) {
  if (!phone || !scene) return;
  const i = scene.walkIndex();
  if (i === wbIndex && !force) return;
  wbIndex = i;
  const p = pairs[i];
  $('#wb-kicker').textContent = `${pad2(i + 1)} / ${p.brand}`;
  $('#wb-title').textContent = p.model;
  $('#wb-price').innerHTML = gel(p.price);
  if (dots.children.length !== pairs.length) dots.innerHTML = pairs.map(() => '<i></i>').join('');
  [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  scene.hover(i);
  hiRes(i); hiRes(Math.min(pairs.length - 1, i + 1));
}
$('#wb-open').addEventListener('click', () => open(scene ? scene.walkIndex() : 0));
setInterval(() => updateWalkbar(false), 120);

// ---------------------------------------------------------------- textures: low-res first, sharp ones later
const hiDone = new Set();
async function loadBitmap(src, forGL = true) {
  // decode off the main thread (premultiplied once for the GPU); fall back to <img> where unsupported
  try {
    const blob = await fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); });
    return await createImageBitmap(blob, forGL ? { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' } : {});
  } catch (e) { return loadImage(src); }
}
function hiRes(i) {
  if (!scene || hiDone.has(i)) return;
  hiDone.add(i);
  loadBitmap(img(pairs[i].id, 1024)).then(im => scene.setShoeImage(i, im, true)).catch(() => hiDone.delete(i));
}
function noGL() {
  scene = null; html.classList.add('no-gl'); html.classList.remove('loading', 'intro'); buildList(); route(false);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ANCHOR = Math.max(0, pairs.findIndex(p => p.id === 'dunk'));

async function boot() {
  applyLang();
  const params = new URLSearchParams(location.search);
  const capture = params.has('capture');
  const saveData = navigator.connection && navigator.connection.saveData;
  let seen = false; try { seen = sessionStorage.getItem('ui.reel') === '1'; sessionStorage.setItem('ui.reel', '1'); } catch (e) {}
  const deep = /^#\/p\//.test(location.hash);
  const reelEl = $('#reel');
  let reel = null;
  if (reelEl && !params.has('noreel') && !saveData) {
    reel = createReel({ root: reelEl, lang, phone, reduced, short: seen || deep || params.has('short'), anchorIndex: ANCHOR, pairs });
    html.classList.add('intro');
    addEventListener('resize', () => reel && reel.resize());
    const skip = e => { if (reel && (e.type !== 'keydown' || ['Escape', 'Enter', ' '].includes(e.key))) reel.skip(); };
    reelEl.addEventListener('pointerdown', skip);
    addEventListener('keydown', skip);
  } else reelEl?.remove();

  // what the reel needs first: the pair it is built around
  let loaded = 0; const total = pairs.length + 4;
  const tickLoad = () => reel && reel.progress(++loaded / total * 100);
  const anchorP = loadBitmap(img(pairs[ANCHOR].id, 1024)).then(b => { reel?.set('anchor', b); tickLoad(); return b; }).catch(() => null);
  if (reel) {
    for (const [k, src] of [['lines', `${ASSET}reel/dunk-lines.webp`], ['held', `${ASSET}reel/held.webp`], ['box', `${ASSET}reel/box.webp`]]) {
      loadBitmap(src, false).then(b => { reel.set(k, b); tickLoad(); }).catch(tickLoad);
    }
  }
  const bitmaps = [];
  const lo = Promise.allSettled(pairs.map((p, i) => loadBitmap(img(p.id, 512)).then(b => { bitmaps[i] = b; reel?.set('pair', b, i); scene?.setShoeImage(i, b, false); tickLoad(); })));

  // let the first frame paint before the GPU work starts (a background tab gets no frames: don't wait for one)
  await Promise.race([new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))), sleep(150)]);
  try { scene = createScene(canvas, { catalog, tier: phone ? 'mid' : 'high', reducedMotion: reduced, onFrame: syncOverlay, manual: capture }); } catch (e) { console.error(e); scene = null; }
  bitmaps.forEach((b, i) => b && scene && scene.setShoeImage(i, b, false));
  const margins = () => { const top = $('.top').getBoundingClientRect(); scene && scene.setMargins(Math.round(top.bottom + 30), 84); };
  const sceneReady = (async () => {
    if (!scene) throw new Error('no webgl');
    margins();
    scene.layout(phone ? 'walk' : 'wall', { start: ANCHOR });
    await scene.ready;
    scene.layout(phone ? 'walk' : 'wall', { start: ANCHOR });
    await lo;
  })();
  let sceneOk = null;
  // warm the GPU up under the reel: the sharp anchor layer, its mips, the first draw
  const warmed = sceneReady.then(async () => {
    sceneOk = true;
    if (reel && !reduced) {
      const b = await anchorP;
      if (b) { scene.setShoeImage(ANCHOR, b, true); hiDone.add(ANCHOR); }
      scene.resize(); scene.introShot(ANCHOR, reel.anchorRect()); scene.renderOnce();
    }
  }, () => { sceneOk = false; });

  // capture mode (tools/reel_video.js): everything loaded, the script drawn by hand
  if (capture && reel) {
    await anchorP; await sceneReady; await Promise.allSettled([document.fonts.ready]);
    await new Promise(r => { const k = setInterval(() => { if (loaded >= total) { clearInterval(k); r(); } }, 50); });
    reel.prepare();
    window.__cap = { reel, scene, land: () => { const b = bitmaps[ANCHOR]; scene.resize(); scene.introShot(ANCHOR, reel.anchorRect()); scene.renderOnce(); reel.land(); html.classList.add('ready'); html.classList.remove('loading', 'intro'); scene.reveal(); } };
    anchorP.then(b => b && scene.setShoeImage(ANCHOR, b, true));
    return;
  }
  // the reel starts once its pair is decoded (or after a short wait on a slow line)
  if (reel) {
    await Promise.race([anchorP, sleep(1600)]);
    try { await Promise.race([document.fonts.ready, sleep(500)]); } catch (e) {}
    // the first frame holds while the GPU warms up (so the cuts don't stutter), then the cuts run
    reel.prime();
    await Promise.race([warmed, sleep(1400)]);
    await reel.play();
    if (sceneOk === null) { reel.hold(); await Promise.race([sceneReady.catch(() => {}), sleep(6000)]); }
  }
  try { await sceneReady; } catch (e) { reel?.land({ fade: true }); return noGL(); }

  // the match cut: put the same pair on the same spot of the real wall, then pull back
  const anchorBmp = await anchorP;
  if (anchorBmp) { scene.setShoeImage(ANCHOR, anchorBmp, true); hiDone.add(ANCHOR); }
  scene.resize();
  if (reel && !reduced) {
    scene.introShot(ANCHOR, reel.anchorRect());
    scene.renderOnce();
    reel.land();
  } else {
    html.classList.add('fade-in');
    reel?.land({ fade: true });
  }
  html.classList.add('ready', 'revealing'); html.classList.remove('loading', 'intro');
  setTimeout(() => html.classList.remove('revealing'), 2600);
  addEventListener('resize', () => {
    const was = phone; phone = phoneQ.matches;
    margins();
    if (was !== phone) { close({ push: false }); scene.layout(phone ? 'walk' : 'wall', { start: ANCHOR }); updateWalkbar(true); }
    else scene.resize();
  });
  document.fonts?.ready.then(() => { margins(); if (current < 0 && !scene.state.held) scene.resize(); });
  route(false);
  scene.reveal({ instant: !reel || reduced });
  updateWalkbar(true);
  const idle = window.requestIdleCallback || (f => setTimeout(f, 300));
  if (!phone && !scene.software) idle(() => pairs.forEach((p, i) => setTimeout(() => hiRes(i), 2200 + i * 140)));
}
function route(push) {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  const i = m ? pairs.findIndex(p => p.id === m[1]) : -1;
  if (i >= 0) open(i, { push }); else close({ push });
}
addEventListener('popstate', () => route(false));
boot();
window.__ui = { get scene() { return scene; }, pairs, open, close };
