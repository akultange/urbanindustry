import { createScene } from './scene.js';
import { createReel } from './reel.js';
import { createSound } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
// The pairs on the wall. The shop edits them in admin/, which publishes catalog.json; the copy built into the
// page is the fallback. They're swapped in, in place, before anything is drawn (loadCatalog).
const pairs = JSON.parse($('#catalog').textContent).pairs.map(normalize);
const catalog = { pairs };
const ASSET = window.__ASSET_BASE || 'assets/';
const IG = 'https://ig.me/m/urbanindustry_';
// the loader plays for everyone; reduced motion only swaps the camera moves for fades.
// ?reel always plays the full loader (a repeat visit otherwise gets the short one)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sound = createSound();
const phoneQ = matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px) and (orientation: portrait)');
const pad2 = n => String(n).padStart(2, '0');

// ---------------------------------------------------------------- copy
const T = {
  ka: {
    skip: 'წყვილების სიაზე გადასვლა', navWall: 'კოლექცია', navAbout: 'ჩვენ შესახებ', bag: 'კალათა',
    h1: 'Urban Industry — კედები თბილისში',
    status: n => `კოლექცია · ${n} წყვილი`, hint: 'დააჭირეთ წყვილს — ნახავთ ფასს და ზომებს.', hintTouch: 'შეეხეთ წყვილს — ნახავთ ფასს და ზომებს.',
    pNote: 'ფეხსაცმელი', chooseSize: 'აირჩიეთ ზომა', orderDirect: 'შეკვეთა Instagram-ზე', pickSize: 'ზომა არ არის არჩეული',
    sizeReady: s => `${s} ზომა — შეკვეთის ტექსტი დაკოპირდება`, addBag: 'კალათაში დამატება', fromFeed: 'ჩვენი Instagram-იდან',
    details: 'ზომები და მიწოდება', detailsText: 'ზომები მითითებულია ევროპული სისტემით (EU). თუ ზომაში დარწმუნებული არ ხართ, მოგვწერეთ პირადში — დაგეხმარებით. ვაგზავნით მთელ მსოფლიოში.',
    back: 'კოლექციაში დაბრუნება', sizesOrder: 'ზომები და შეკვეთა', bagTitle: 'კალათა', bagEmpty: 'კალათა ცარიელია.',
    total: 'ჯამი', sendDirect: 'შეკვეთის გაგზავნა Instagram-ზე', sendHint: 'შეკვეთის ტექსტი დაკოპირდება — ჩასვით ჩატში', orMessenger: 'ან მოგვწერეთ Messenger-ზე',
    confirm: 'მარაგს, ფასს და მიწოდებას ჩატში დაგიდასტურებთ.', aboutKicker: 'Urban Industry / თბილისი',
    aboutTitle: 'ჩვენი კედელი — ახლა საიტზეც.', aboutLead: 'კედების მაღაზია თბილისში. Instagram-ზე 144 ათასი გამომწერი გვყავს, ვაგზავნით მთელ მსოფლიოში.',
    aboutText: 'აქ ის წყვილებია, რომლებიც ჩვენს Instagram-ზეა. აირჩიეთ წყვილი და ზომა, შეკვეთისთვის კი მოგვწერეთ პირადში — მარაგს, ფასს და მიწოდებას იქვე დაგიდასტურებთ.',
    step1: 'აირჩიეთ წყვილი და ზომა.', step2: 'დააჭირეთ „შეკვეთა Instagram-ზე“ — შეკვეთის ტექსტი დაკოპირდება.', step3: 'ჩასვით ჩატში. დაგიდასტურებთ და გამოგიგზავნით.',
    bags: 'ჩანთები', concept: 'საიტის კონცეფცია: LADZE studio. ფასები საორიენტაციოა.',
    copied: 'შეკვეთის ტექსტი დაკოპირდა — ჩასვით ჩატში', added: 'კალათაში დაემატა', pickFirst: 'გთხოვთ, აირჩიოთ ზომა', soldOut: 'ამოიწურა', remove: 'წაშლა',
    msg: (lines, total) => `გამარჯობა! მინდა შევუკვეთო:\n${lines}${total ? `\nჯამი: ${total} ₾` : ''}\n(საიტიდან)`,
    line: (p, s) => `${p.brand} ${p.model} (${p.color.ka}), ${s} ზომა — ${p.price} ₾`,
    title: 'Urban Industry — კედები, თბილისი', size: 'ზომა', sound: 'ხმა',
  },
  en: {
    skip: 'Skip to the pairs', navWall: 'Wall', navAbout: 'About', bag: 'Bag',
    h1: 'Urban Industry — sneakers from Tbilisi',
    status: n => `Wall 01 / ${n} ${n === 1 ? 'pair' : 'pairs'}`, hint: 'Hover to light it. Click to take it off the shelf.', hintTouch: 'Tap a pair to take it off the shelf.',
    pNote: 'Wall 01 / Footwear', chooseSize: 'Choose your size', orderDirect: 'Order in Direct', pickSize: 'Pick your size first',
    sizeReady: s => `EU ${s} · your order gets copied`, addBag: 'Add to bag', fromFeed: 'From our feed',
    details: 'Sizing & delivery', detailsText: 'EU sizing. Not sure about yours? Tell us the size you usually wear in Direct. We ship worldwide.',
    back: 'Back to the wall', sizesOrder: 'Sizes & order', bagTitle: 'Your bag', bagEmpty: 'Your bag is empty. Light up a pair.',
    total: 'Total', sendDirect: 'Send the order in Direct', sendHint: 'Your order is copied — paste it in the chat', orMessenger: 'or via Messenger',
    confirm: 'We confirm stock, price and delivery in the chat.', aboutKicker: 'Urban Industry / Tbilisi',
    aboutTitle: 'A sneaker wall you can walk along.', aboutLead: 'A sneaker store from Tbilisi with 144K people on Instagram. We ship worldwide.',
    aboutText: 'Every pair here comes straight from our feed. Pick one, choose your size and finish the order with us in Direct — we confirm stock, price and delivery right there.',
    step1: 'Pick a pair and your size.', step2: 'Tap “Order in Direct” — your order is copied.', step3: 'Paste it in the chat. We confirm and ship.',
    bags: 'Bags', concept: 'Concept site by LADZE studio. Prices are indicative.',
    copied: 'Order copied — paste it in the chat', added: 'Added to your bag', pickFirst: 'Pick your size first', soldOut: 'Sold out', remove: 'Remove',
    msg: (lines, total) => `Hi! I'd like to order:\n${lines}${total ? `\nTotal: ${total} ₾` : ''}\n(from the urbanindustry site)`,
    line: (p, s) => `${p.brand} ${p.model} (${p.color.en}), EU ${s} — ${p.price} ₾`,
    title: 'Urban Industry — sneakers, Tbilisi', size: 'Size', sound: 'Sound',
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
  $$('[data-i18n]').forEach(el => { const v = t(el.dataset.i18n, pairs.length); if (typeof v === 'string') el.textContent = v; });
  $('#wall-count').textContent = pairs.length;
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('#sound-btn').setAttribute('aria-label', t('sound')); $('#sound-btn').title = t('sound');
  buildLabels(); buildList();
  if (current >= 0) fillProduct(current);
  renderBag(); updateWalkbar(true);
}
$$('.lang button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('lang', lang); applyLang(); }));

// ---------------------------------------------------------------- helpers
const gel = n => `${n}<span class="gel"> ₾</span>`;
// pictures: shoes/<id>-<512|1024>.<ext>?v=<hash> and photos/<name>[-t].<ext>; a draft preview's unpublished
// pictures come from this browser's storage instead (DRAFT_IMG, keyed by the same paths)
const SHOE_V = {}, SHOE_EXT = {}, DRAFT_IMG = {};
const img = (id, size) => DRAFT_IMG[`shoes/${id}-${size}`] || `${ASSET}shoes/${id}-${size}.${SHOE_EXT[id] || 'webp'}${SHOE_V[id] ? `?v=${SHOE_V[id]}` : ''}`;
const photo = (ph, thumb) => DRAFT_IMG[`photos/${ph.src}${thumb ? '-t' : ''}`] || `${ASSET}photos/${ph.src}${thumb ? '-t' : ''}.${ph.ext || 'webp'}`;
// a pair as the page expects it, whatever the admin (or an older catalog) left out
function normalize(p) {
  const two = v => (v && typeof v === 'object' ? { ka: v.ka || v.en || '', en: v.en || v.ka || '' } : { ka: v || '', en: v || '' });
  const sizes = (Array.isArray(p.sizes) ? p.sizes : []).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  return {
    ...p, brand: p.brand || '', model: p.model || '', color: two(p.color), desc: two(p.desc), price: Number(p.price) || 0,
    sizes, soldOut: (Array.isArray(p.soldOut) ? p.soldOut : []).map(Number).filter(n => sizes.includes(n)),
    photos: Array.isArray(p.photos) ? p.photos.filter(ph => ph && ph.src) : [],
    rect: Array.isArray(p.rect) && p.rect.length === 4 ? p.rect : [0.04, 0.06, 0.96, 0.99], base: p.base ?? 0.012,
  };
}
function indexPictures() { for (const p of pairs) { SHOE_V[p.id] = p.v; SHOE_EXT[p.id] = p.ext; } }
indexPictures();
// the live catalog (fresh past the CDN's cache, so a publish shows up as soon as it's deployed); ?draft shows
// the admin's unpublished edits, in this browser only
async function loadCatalog(draft) {
  let next = null;
  if (draft) {
    try {
      const d = JSON.parse(localStorage.getItem('ui.admin.draft') || 'null');
      if (d && d.catalog) {
        next = d.catalog;
        const files = await draftFiles();
        for (const [k, blob] of Object.entries(files)) DRAFT_IMG[k] = URL.createObjectURL(blob);
        html.classList.add('draft');
      }
    } catch (e) {}
  }
  if (!next) {
    try {
      const ctl = new AbortController(), k = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(`catalog.json?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(k);
      if (r.ok) next = await r.json();
    } catch (e) {}
  }
  const wall = next && Array.isArray(next.pairs) ? next.pairs.filter(p => p && p.id).slice(0, 10).map(normalize) : [];
  if (wall.length) pairs.splice(0, pairs.length, ...wall);
  indexPictures();
}
// the admin keeps pictures it hasn't published yet in IndexedDB (admin.js, same origin)
function draftFiles() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open('ui-admin', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('files');
      rq.onerror = () => res({});
      rq.onsuccess = () => {
        const out = {}, tx = rq.result.transaction('files', 'readonly'), st = tx.objectStore('files');
        const cur = st.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
        cur.onerror = () => res(out);
      };
    } catch (e) { res({}); }
  });
}
const catalogP = loadCatalog(new URLSearchParams(location.search).has('draft'));
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
    // a price tag under the lit shelf: a dark plate so it reads over the LED's glow, the price lit like the sign
    const d = document.createElement('div'); d.className = 'lbl';
    d.innerHTML = `<div class="tag"><span class="meta">${pad2(i + 1)} · ${p.brand}</span><span class="row"><b>${p.model}</b><span class="price">${p.price} ₾</span></span></div>`;
    labelsEl.append(d); return d;
  });
}
let hoverI = -1;
const FOOT = 64; // the footer bar's height (style.css .bottom)
// one place for hover: the shelf lights, the tag shows, the footer hint steps aside
function setHover(i) {
  hoverI = i; scene && scene.hover(i);
  document.body.classList.toggle('hovering', i >= 0);
}
function syncOverlay(s) {
  if (phone || current >= 0) return;
  for (let i = 0; i < labelEls.length; i++) {
    const el = labelEls[i];
    const on = i === hoverI;
    if (on) {
      const p = s.labelPoint(i);
      // never down into the footer (the camera leaves room for it; this is the safety net)
      if (!el._h) el._h = el.firstChild.offsetHeight;
      const y = Math.min(p ? p.y + 6 : 0, innerHeight - FOOT - 12 - el._h);
      if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(y)}px) translate(-50%, 0)`;
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
    b.addEventListener('click', () => { picked = s; fillProduct(i); sound.ui('size'); });
    sizes.append(b);
  }
  const order = $('#order');
  const ready = picked != null;
  order.classList.toggle('ready', ready);
  order.setAttribute('aria-disabled', String(!ready));
  $('#order-hint').textContent = ready ? t('sizeReady', picked) : t('pickSize');
  const th = $('#thumbs'); th.innerHTML = '';
  th.closest('.p-feed').hidden = !p.photos.length;
  p.photos.forEach((ph, k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'thumb';
    b.setAttribute('aria-label', `${p.model} — photo ${k + 1}`);
    b.innerHTML = `<img src="${photo(ph, true)}" alt="" loading="lazy" decoding="async">`;
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
  if (!productEl.classList.contains('open')) sound.ui('open');
  productEl.classList.add('open'); productEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('focused');
  if (phone) {
    document.body.classList.add('sheet-open');
    // frame the pair in what the sheet leaves free
    const top = $('.top').getBoundingClientRect().bottom, panel = $('.p-panel');
    if (scene && panel) scene.setFocusBand(top + 6, innerHeight - panel.offsetHeight - 10);
  }
  if (scene) scene.focus(i);
  setHover(-1);
  hiRes(i); hiRes((i + 1) % pairs.length); hiRes((i - 1 + pairs.length) % pairs.length);
  if (push && location.hash !== `#/p/${pairs[i].id}`) history.pushState({ p: pairs[i].id }, '', `#/p/${pairs[i].id}`);
  if (!phone) setTimeout(() => { if (current === i) $('#sizes .size:not(:disabled)')?.focus({ preventScroll: true }); }, 700);
}
function close({ push = true } = {}) {
  if (current < 0) return;
  current = -1; picked = null;
  sound.ui('close');
  productEl.classList.remove('open'); productEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('focused', 'sheet-open');
  if (scene) scene.focus(-1);
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
  sound.ui('order');
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
  bag.push({ id: pairs[current].id, size: picked }); store.set('bag', bag); renderBag(); sound.ui('bag');
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
// The browser's own bars take the page's colour at each edge: Safari 26 from the .tint strips (style.css),
// Chrome on Android and older Safari from theme-color. While a panel is open, they go dark with it.
const themeMeta = document.querySelector('meta[name=theme-color]');
function syncBars() {
  const layer = !!document.querySelector('.drawer.open, .about.open, .lightbox.open');
  html.classList.toggle('layer', layer);
  const live = html.classList.contains('ready') || html.classList.contains('no-gl');
  const c = !live ? '#a2c1f0' : layer || html.classList.contains('no-gl') ? '#0b0c0e' : phoneQ.matches ? '#1b1c1f' : '#17181b';
  if (themeMeta && themeMeta.content !== c) themeMeta.content = c;
}
// Panels sit out of the page while shut ([hidden]: Safari would read a hidden panel's dark background as the
// colour for its bars), and come back for their transitions.
function openLayer(id) {
  lastFocus = document.activeElement;
  const el = $('#' + id);
  clearTimeout(el._shut);
  if (el.hidden) { el.hidden = false; void el.offsetWidth; }   // back in the page, then the transition runs
  el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.querySelector('.close')?.focus({ preventScroll: true }), 60);
  if (id === 'about') $$('.nav button').forEach(b => b.classList.toggle('is-on', b.dataset.go === 'about'));
  syncBars();
}
function closeLayer(id) {
  const el = $('#' + id); if (!el.classList.contains('open')) return false;
  el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
  clearTimeout(el._shut);
  el._shut = setTimeout(() => { if (!el.classList.contains('open')) el.hidden = true; }, 600);   // after its fade or slide
  if (id === 'about') $$('.nav button').forEach(b => b.classList.toggle('is-on', b.dataset.go === 'wall'));
  lastFocus?.focus?.({ preventScroll: true });
  syncBars();
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
  const im = $('#lb-img'); im.src = photo(ph); im.alt = `${p.brand} ${p.model}`;
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
    setHover(hoverI < 0 ? 0 : (hoverI + (e.key === 'ArrowRight' ? 1 : -1) + pairs.length) % pairs.length);
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
  if (i !== hoverI) { setHover(i); canvas.style.cursor = i >= 0 ? 'pointer' : ''; if (i >= 0) sound.ui('hover'); }
});
canvas.addEventListener('pointerleave', () => { if (!scene || phone) return; scene.pointer(0, 0, false); if (current < 0) setHover(-1); });
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

// phone: tap a pair to take it off the shelf (it lights up first); tap the wall to put it back
let lastX = 0, lastT = 0, vel = 0, moved = 0;
canvas.addEventListener('pointerdown', e => {
  if (!scene || !phone) return;
  down = { x: e.clientX, y: e.clientY, id: e.pointerId }; lastX = e.clientX; lastT = performance.now(); vel = 0; moved = 0;
  canvas.setPointerCapture(e.pointerId);
  scene.pointer(e.clientX, e.clientY, true);
});
function dragMove(e) {
  moved = Math.max(moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
  scene.pointer(e.clientX, e.clientY, true);
}
const endDrag = e => {
  if (!down || !scene) return;
  const tap = moved < 10;
  down = null;
  if (tap) {
    const i = scene.pick(e.clientX, e.clientY);
    if (current >= 0) { if (i !== current) close(); }
    else if (i >= 0) { setHover(i); sound.ui('hover'); setTimeout(() => { if (current < 0) open(i); }, 160); }
  }
  setTimeout(() => scene.pointer(0, 0, false), 900);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// phone: the bar shows the pair you're standing at
const dots = $('#dots');
let wbIndex = -1;
function updateWalkbar(force) {
  if (!phone || !scene || scene.state.mode !== 'walk') return;
  const i = scene.walkIndex();
  if (i === wbIndex && !force) return;
  if (!force) sound.ui('step');
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
  scene = null; html.classList.add('no-gl'); html.classList.remove('loading', 'intro'); buildList(); route(false); syncBars();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// the pair the loader is built around (its film, its photos); found once the live catalog is in
let ANCHOR = 0;

// sound: the header toggle, remembered; browsers only start audio from a click or a key
const soundBtn = $('#sound-btn');
const setSoundUI = on => { soundBtn.setAttribute('aria-pressed', String(on)); const r = $('#reel [data-hud=sound]'); if (r) { r.setAttribute('aria-pressed', String(on)); r.textContent = reelCopy(on ? 'soundOff' : 'soundOn'); } };
let reelCopy = k => k;
async function soundOn() { const ok = await sound.enable(); setSoundUI(ok); store.set('sound', ok); return ok; }
let liveReel = null; // the reel, while it runs: if sound goes off mid-reel it has to leave the audio clock
function soundOff() { sound.disable(); liveReel?.unclock(); setSoundUI(false); store.set('sound', false); }
soundBtn.addEventListener('click', () => (sound.on ? soundOff() : soundOn().then(ok => ok && sound.ui('hover'))));

async function boot() {
  await catalogP;
  ANCHOR = Math.max(0, pairs.findIndex(p => p.id === 'dunk'));
  applyLang();
  const params = new URLSearchParams(location.search);
  const capture = params.has('capture');
  const saveData = navigator.connection && navigator.connection.saveData;
  const reelEl = $('#reel');
  let reel = null;
  if (!(window.AudioContext || window.webkitAudioContext)) soundBtn.hidden = true;
  if (reelEl && !params.has('noreel') && !saveData) {
    // the full film is made around the Dunk (its photos, its drawing): without it on the wall, the short cut
    const dunk = pairs[ANCHOR].id === 'dunk';
    reel = createReel({ root: reelEl, lang, phone, isPhone: () => phoneQ.matches, reduced: false, short: params.has('short') || !dunk, film: capture, anchorIndex: ANCHOR, pairs, name: `${pairs[ANCHOR].brand} ${pairs[ANCHOR].model}` });
    reelCopy = reel.copy; liveReel = reel;
    html.classList.add('intro');
    addEventListener('resize', () => reel && reel.resize());
    const isSoundBtn = e => e.target && e.target.closest && e.target.closest('[data-hud=sound]');
    const atGate = () => reelEl.classList.contains('gate') || reelEl.classList.contains('opening');
    const skip = e => { if (isSoundBtn(e) || atGate()) return; if (reel && (e.type !== 'keydown' || ['Escape', 'Enter', ' '].includes(e.key))) reel.skip(); };
    reelEl.addEventListener('pointerdown', skip);
    addEventListener('keydown', skip);
    // "Sound on" replays the reel from the top, with the score on the audio clock
    const rs = reelEl.querySelector('[data-hud=sound]');
    rs.textContent = reel.copy('soundOn');
    if (soundBtn.hidden) rs.hidden = true;
    rs.addEventListener('pointerdown', e => e.stopPropagation());
    rs.addEventListener('click', async () => {
      if (sound.on) { soundOff(); return; }
      if (!(await soundOn())) return;
      const start = sound.now() + 0.12;
      reel.restart(start * 1000, () => sound.now() * 1000);
      sound.reel(reel.timeline(), start);
    });
  } else reelEl?.remove();
  // what the reel needs first: the pair it is built around
  let loaded = 0; const total = pairs.length + 1 + (pairs[ANCHOR].id === 'dunk' ? 3 : 0);
  const tickLoad = () => reel && reel.progress(++loaded / total * 100);
  const anchorP = loadBitmap(img(pairs[ANCHOR].id, 1024)).then(b => { reel?.set('anchor', b); tickLoad(); return b; }).catch(() => null);
  if (reel) {
    for (const [k, src] of pairs[ANCHOR].id === 'dunk' ? [['lines', `${ASSET}reel/dunk-lines.webp`], ['held', `${ASSET}reel/held.webp`], ['box', `${ASSET}reel/box.webp`]] : []) {
      loadBitmap(src, false).then(b => { reel.set(k, b); tickLoad(); }).catch(tickLoad);
    }
  }
  const bitmaps = [];
  const lo = Promise.allSettled(pairs.map((p, i) => loadBitmap(img(p.id, 512)).then(b => { bitmaps[i] = b; reel?.set('pair', b, i); scene?.setShoeImage(i, b, false); tickLoad(); })));

  // The box, every visit. Browsers only let a page start sound after a click on that page (Chrome counts a
  // reload as a new page), and opening the box is that click. The one exception: on a computer, if they chose
  // sound before and the browser lets this page start it by itself, the loader goes straight in with sound.
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  let showBox = !!reel && !capture && !params.has('nogate');
  if (showBox && !touch && store.get('sound', false) && await sound.tryStart()) { setSoundUI(true); showBox = false; }
  const gateP = showBox
    ? reel.gate({ onOpen: withSound => (withSound ? soundOn() : (soundOff(), null)) })
    : null;
  // sound left on but not allowed to start yet (and no box to ask): start on their first click
  if (!gateP && !sound.on && store.get('sound', false)) {
    setSoundUI(false);
    const resume = () => { removeEventListener('pointerdown', resume, true); removeEventListener('keydown', resume, true); if (!sound.on) soundOn(); };
    addEventListener('pointerdown', resume, true); addEventListener('keydown', resume, true);
  }

  // let the first frame paint before the GPU work starts (a background tab gets no frames: don't wait for one)
  await Promise.race([new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))), sleep(150)]);
  try { scene = createScene(canvas, { catalog, tier: phone && !capture ? 'mid' : 'high', reducedMotion: reduced, onFrame: syncOverlay, manual: capture, film: capture }); } catch (e) { console.error(e); scene = null; }
  bitmaps.forEach((b, i) => b && scene && scene.setShoeImage(i, b, false));
  const margins = () => { const top = $('.top').getBoundingClientRect(); scene && scene.setMargins(Math.round(top.bottom + (phone ? 16 : 30)), phone ? 52 : FOOT + 50); };
  const sceneReady = (async () => {
    if (!scene) throw new Error('no webgl');
    margins();
    scene.layout('wall', { start: ANCHOR });
    await scene.ready;
    scene.layout('wall', { start: ANCHOR });
    await lo;
  })();
  let sceneOk = null;
  // warm the GPU up under the reel: the sharp anchor layer, its mips, the first draw
  const matchCut = !!reel && !reduced;
  const warmed = sceneReady.then(async () => {
    sceneOk = true;
    if (reel) {
      const b = await anchorP;
      if (b) { scene.setShoeImage(ANCHOR, b, true); hiDone.add(ANCHOR); }
      scene.resize(); if (matchCut) scene.introShot(ANCHOR, reel.anchorRect()); scene.renderOnce();
    }
  }, () => { sceneOk = false; });

  // capture mode (tools/reel_video.js): everything loaded, the script drawn by hand
  if (capture && reel) {
    await anchorP; await sceneReady; await Promise.allSettled([document.fonts.ready]);
    await new Promise(r => { const k = setInterval(() => { if (loaded >= total) { clearInterval(k); r(); } }, 50); });
    // the film shows the wall the way a real GPU does: every pair's sharp layer, mipmapped
    await Promise.allSettled(pairs.map((p, i) => loadBitmap(img(p.id, 1024)).then(b => { scene.setShoeImage(i, b, true); hiDone.add(i); })));
    await sleep(500); scene.renderOnce();
    reel.prepare();
    const { renderScore } = await import('./sound.js');
    window.__cap = {
      reel, scene,
      // the hand-off: the reel stays on top so the film can dissolve it by hand (reel.dissolve)
      land: () => { scene.resize(); scene.introShot(ANCHOR, reel.anchorRect()); scene.renderOnce(); reel.land({ keep: true }); html.classList.add('ready'); html.classList.remove('loading', 'intro'); scene.reveal(); },
      // the score for the preview video, as base64 WAV
      score: async ({ boxAt, openDur, reelAt, landAt }) => {
        const sweep = pairs.map((_, k) => 0.55 + k * 0.065);
        const { wav, peak } = await renderScore({ timeline: reel.timeline(), boxAt, openDur, reelAt, landAt, sweep });
        let bin = ''; for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
        return { b64: btoa(bin), peak };
      },
    };
    anchorP.then(b => b && scene.setShoeImage(ANCHOR, b, true));
    return;
  }
  // the reel starts once its pair is decoded (or after a short wait on a slow line)
  if (reel) {
    let beat = null;  // audio time the reel's first beat should land on
    if (gateP) {
      const choice = await gateP;
      if (choice.ready) await choice.ready;
      // the lid comes off and the pair rises out of the box while the last of the loading finishes;
      // the opening's sound swells into the reel's first beat
      const tOpen = sound.open(reel.openMs / 1000);
      if (tOpen != null) beat = tOpen + reel.openMs / 1000;
      await Promise.all([reel.openBox(), Promise.race([anchorP, sleep(1600)]), Promise.race([warmed, sleep(1400)])]);
    } else {
      await Promise.race([anchorP, sleep(1600)]);
      try { await Promise.race([document.fonts.ready, sleep(500)]); } catch (e) {}
      // the first frame holds while the GPU warms up (so the cuts don't stutter), then the cuts run
      reel.prime();
      await Promise.race([warmed, sleep(1400)]);
    }
    const run = reel.play();
    if (sound.on) {
      const start = beat != null ? Math.max(sound.now() + 0.02, beat) : sound.now() + 0.1;
      reel.restart(start * 1000, () => sound.now() * 1000); sound.reel(reel.timeline(), start);
    }
    await run;
    if (sceneOk === null) { reel.hold(); await Promise.race([sceneReady.catch(() => {}), sleep(6000)]); }
    // "Sound on" near the end restarts the reel: let that run play out
    while (reel.running) await reel.ended();
  }
  try { await sceneReady; } catch (e) { sound.stopReel(); reel?.land({ fade: true }); return noGL(); }

  // the match cut: put the same pair on the same spot of the real wall, then pull back
  // (with reduced motion the reel fades onto the wall instead: no zoom)
  const anchorBmp = await anchorP;
  if (anchorBmp && !hiDone.has(ANCHOR)) { scene.setShoeImage(ANCHOR, anchorBmp, true); hiDone.add(ANCHOR); }
  // the window may have changed between phone and desktop while the loader ran
  if (phoneQ.matches !== phone) { phone = phoneQ.matches; margins(); scene.layout('wall', { start: ANCHOR }); }
  scene.resize();
  if (matchCut) {
    scene.introShot(ANCHOR, reel.anchorRect());
    scene.renderOnce();
    // the loader dissolves into the real wall (same pair, same pixels) as the camera starts to pull back
    reel.land({ fade: true });
  } else {
    if (!reel) html.classList.add('fade-in');
    scene.reveal({ instant: true }); scene.renderOnce();
    reel?.land({ fade: true });
  }
  if (reel) sound.land(reduced ? [] : pairs.map((_, k) => 0.55 + k * 0.065));
  html.classList.add('ready', 'revealing'); html.classList.remove('loading', 'intro'); syncBars();
  setTimeout(() => html.classList.remove('revealing'), 4200);
  addEventListener('resize', () => {
    const was = phone; phone = phoneQ.matches;
    margins();
    if (was !== phone) { close({ push: false }); scene.layout('wall', { start: ANCHOR }); syncBars(); }
    else scene.resize();
  });
  document.fonts?.ready.then(() => { margins(); if (current < 0 && !scene.state.held) scene.resize(); });
  route(false);
  scene.reveal({ instant: !matchCut });
  updateWalkbar(true);
  const idle = window.requestIdleCallback || (f => setTimeout(f, 300));
  // the sharp layers come in once the pull-back is over (uploading them mid-move can drop a frame); phones too,
  // now that they draw at full resolution: the 512 px layers read soft there
  if (!scene.software) idle(() => pairs.forEach((p, i) => setTimeout(() => hiRes(i), 3300 + i * (phone ? 200 : 120))));
}
function route(push) {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  const i = m ? pairs.findIndex(p => p.id === m[1]) : -1;
  if (i >= 0) open(i, { push }); else close({ push });
}
addEventListener('popstate', () => route(false));
boot();
window.__ui = { get scene() { return scene; }, pairs, open, close };
