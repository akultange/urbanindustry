// The shop's own manager for the wall: add a pair from a photo, set its price and sizes, mark sizes sold out,
// reorder the wall, take pairs off it, preview, publish. Publishing is a commit to the site's repository on
// GitHub (github.js), so there's no server to run and nothing to pay for. Without signing in it runs as a demo:
// everything works and previews on the real wall, but stays in this browser.
import { decode, hasAlpha, findPair, cut, layer, encode, feedPhoto } from './cutout.js';
import { github, Conflict } from './github.js';
import { files, local } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const MAX = 10;              // shelves on the wall (shaders.js NS)
const INTRO = 'dunk';        // the pair the loader's film is made around: it stays on the wall
const SIZES = Array.from({ length: 13 }, (_, i) => 35 + i);
const SITE = '../', VENDOR = 'vendor/';
const DEFAULT_REPO = 'akultange/urbanindustry';
const params = new URLSearchParams(location.search);
const API = params.get('api') || 'https://api.github.com';   // the tests point this at a stand-in

// ---------------------------------------------------------------- copy
const T = {
  ka: {
    title: 'Urban Industry — ადმინ-პანელი', admin: 'ადმინ-პანელი', openSite: 'საიტის ნახვა ↗',
    onWall: 'საიტზე', wallSub: n => `${n} / ${MAX} წყვილი · საიტზე ამავე თანმიმდევრობით ჩანს`, add: '+ წყვილის დამატება',
    offWall: 'დამალული', offWallSub: 'ეს წყვილები საიტზე არ ჩანს — ნებისმიერ დროს შეგიძლია დააბრუნო.', archiveEmpty: 'დამალული წყვილები არ არის.',
    preview: 'წინასწარი ნახვა', publish: 'გამოქვეყნება', intro: 'ინტრო', earlier: 'წინ გადატანა', later: 'უკან გადატანა',
    demo: 'სადემონსტრაციო რეჟიმი: ყველაფერი მუშაობს, მაგრამ ცვლილებები მხოლოდ ამ ბრაუზერში შეინახება.',
    signInCta: 'შესვლა',
    signedIn: (u, r) => `შესული ხარ: <b>@${u}</b> · ${r}`, signOut: 'გასვლა',
    keyFailed: 'შენახული ტოკენი აღარ მუშაობს — ხელახლა შედი.',
    changes: n => `<b>${n}</b> გამოუქვეყნებელი ცვლილება`,
    newPair: 'ახალი წყვილი', editPair: 'რედაქტირება',
    photoTitle: 'ფოტო', photoHint: 'ატვირთე ერთი ფეხსაცმლის ფოტო გვერდიდან — ფონი ავტომატურად მოშორდება. ფოტოზე ხელი ან ფეხი არ უნდა ჩანდეს.',
    choose: 'ფოტოს ატვირთვა', change: 'ფოტოს შეცვლა', flip: 'შებრუნება ↔', straighten: 'დახრა', edge: 'კონტური',
    removeBg: 'ფონის მოშორება',
    loadingModel: p => `ფონის მოშორება მზადდება… ${p}%<br><small>ეს მხოლოდ პირველად ხდება</small>`,
    finding: 'ფონს ვაშორებთ…', saving: 'ინახება…',
    plainOnly: 'ავტომატური მოშორება ვერ ჩაიტვირთა, ამიტომ ფონი ფერის მიხედვით მოვაშორეთ. ერთფეროვან ფონზე ეს კარგად მუშაობს.',
    busyBg: 'ფონი ჭრელია — თუ რამე დარჩა, სცადე ერთფეროვან ფონზე გადაღებული ფოტო.',
    readFailed: 'ფოტო ვერ გაიხსნა — სცადე JPEG ან PNG.',
    brand: 'ბრენდი', model: 'მოდელი', colorKa: 'ფერი (ქართულად)', colorEn: 'ფერი (ინგლისურად)', price: 'ფასი',
    sizes: 'ზომები (EU)', inStock: 'მარაგშია', soldOut: 'ამოიწურა', sizesHint: 'ერთხელ დააჭირე — მარაგშია, ორჯერ — ამოიწურა, სამჯერ — ზომა მოიხსნება.',
    more: 'აღწერა და ფოტოები', descKa: 'აღწერა (ქართულად)', descEn: 'აღწერა (ინგლისურად)', feed: 'ფოტოები ინსტაგრამიდან',
    delete: 'წაშლა', done: 'შენახვა', takeOff: 'დამალვა', putOn: 'საიტზე დაბრუნება',
    wallFull: 'საიტზე უკვე 10 წყვილია — ახლის დასამატებლად ჯერ ერთ-ერთი დამალე.', wentOff: 'საიტზე უკვე 10 წყვილია, ამიტომ ახალი წყვილი დამალულებში შევინახეთ.',
    errName: 'მიუთითე ბრენდი და მოდელი.', errPrice: 'მიუთითე ფასი.', errSizes: 'მონიშნე ერთი ზომა მაინც.', errPhoto: 'ატვირთე ფოტო.',
    confirmDelete: n => `წავშალოთ ${n}?`, introLocked: 'საიტის ინტრო ამ წყვილზეა აწყობილი, ამიტომ მისი დამალვა არ შეიძლება.',
    sizesSum: (n, o) => `${n} ზომა${o ? ` · ${o} ამოიწურა` : ''}`,
    signIn: 'შესვლა', signInLead: 'საიტი GitHub-ზეა განთავსებული და ცვლილებებიც იქ ქვეყნდება. ამისთვის ერთხელ დაგჭირდება ტოკენი — ის მხოლოდ ამ ბრაუზერში შეინახება.',
    steps: ['გახსენი <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → ახალი ტოკენი</a> (Fine-grained token).',
      'Repository access: <b>Only select repositories</b> → <code>urbanindustry</code>.',
      'Permissions → Repository → <b>Contents: Read and write</b>.', '<b>Generate token</b> — დააკოპირე (იწყება <code>github_pat_</code>-ით) და ჩასვი აქ.'],
    key: 'ტოკენი', repoAdv: 'რეპოზიტორი', signInGo: 'შესვლა', badKey: 'ეს ტოკენი არ მუშაობს.', noRepo: r => `ამ ტოკენს ${r}-ზე წვდომა არ აქვს.`,
    publishGo: 'გამოქვეყნება', discard: 'ცვლილებების გაუქმება', confirmDiscard: 'გავაუქმოთ ყველა გამოუქვეყნებელი ცვლილება?',
    needSignIn: 'გამოსაქვეყნებლად საჭიროა შესვლა.', publishing: 'ქვეყნდება…', published: 'გამოქვეყნდა. საიტი დაახლოებით ერთ წუთში განახლდება.',
    live: 'საიტი განახლდა ✓', nothing: 'გამოსაქვეყნებელი არაფერია.',
    conflict: 'ამასობაში სხვამ გამოაქვეყნა ცვლილებები. განაახლე გვერდი, რომ ნახო — შენი ცვლილებები ამ ბრაუზერში შენახული დარჩება.',
    noWrite: 'ამ ტოკენით გამოქვეყნება ვერ ხერხდება — საჭიროა Contents: Read and write.', failed: e => `ვერ გამოქვეყნდა: ${e}`,
    chAdded: n => `დაემატა: ${n}`, chDeleted: n => `წაიშალა: ${n}`, chOn: n => `საიტზე დაბრუნდა: ${n}`, chOff: n => `დაიმალა: ${n}`,
    chOrder: 'შეიცვალა თანმიმდევრობა', fPrice: (a, b) => `ფასი ${a} → ${b} ₾`, fSizes: 'ზომები', fPhoto: 'ფოტო', fText: 'ტექსტი',
    discarded: 'ცვლილებები გაუქმდა.', saved: 'შენახულია. საიტზე გამოქვეყნების შემდეგ გამოჩნდება.', previewHint: 'წინასწარი ნახვა ახალ ჩანართში გაიხსნება — მას მხოლოდ შენ ხედავ.',
  },
  en: {
    title: 'Urban Industry — Admin', admin: 'Admin', openSite: 'Site ↗',
    onWall: 'On the wall', wallSub: n => `${n} of ${MAX} pairs · in this order on the site`, add: '+ New pair',
    offWall: 'Off the wall', offWallSub: 'Waiting here — not on the site.', archiveEmpty: 'Nothing here.',
    preview: 'See it on the wall', publish: 'Publish', intro: 'Intro', earlier: 'Earlier', later: 'Later',
    demo: 'Demo mode — everything works, but changes stay in this browser.',
    signInCta: 'Sign in to publish',
    signedIn: (u, r) => `Signed in as <b>@${u}</b> · publishing to ${r}`, signOut: 'Sign out',
    keyFailed: 'The saved key stopped working — sign in again.',
    changes: n => `<b>${n}</b> unpublished ${n === 1 ? 'change' : 'changes'}`,
    newPair: 'New pair', editPair: 'Edit pair',
    photoTitle: 'Photo', photoHint: 'One shoe from the side — the background comes off by itself. Hands and feet stay in.',
    choose: 'Choose a photo', change: 'Change the photo', flip: 'Mirror', straighten: 'Straighten', edge: 'Edge',
    removeBg: 'Remove the background',
    loadingModel: p => `Getting the cut-out tool… ${p}%<br><small>first time only</small>`,
    finding: 'Finding the pair…', saving: 'Saving…',
    plainOnly: "Couldn't get the cut-out tool, so the background was taken out by colour — that works on a plain one.",
    busyBg: "Busy background — if something's left over, try a photo on a plain one.",
    readFailed: "Couldn't open that photo — try a JPEG or PNG.",
    brand: 'Brand', model: 'Model', colorKa: 'Colour (Georgian)', colorEn: 'Colour (English)', price: 'Price',
    sizes: 'Sizes (EU)', inStock: 'In stock', soldOut: 'Sold out', sizesHint: 'Tap a size: not carried → in stock → sold out.',
    more: 'Description and photos', descKa: 'Description (Georgian)', descEn: 'Description (English)', feed: 'Photos — “From our feed”',
    delete: 'Delete', done: 'Save', takeOff: 'Take off the wall', putOn: 'Put on the wall',
    wallFull: 'The wall is full (10 pairs) — take one off first.', wentOff: 'The wall is full — the pair is waiting off the wall.',
    errName: 'Brand and model are needed.', errPrice: 'Add a price.', errSizes: 'Pick at least one size.', errPhoto: 'Add a photo.',
    confirmDelete: n => `Delete ${n}?`, introLocked: 'The intro is built around this pair, so it stays on the wall.',
    sizesSum: (n, o) => `${n} sizes${o ? ` · ${o} sold out` : ''}`,
    signIn: 'Sign in', signInLead: 'The site lives on GitHub and publishing happens there, with a key (a token) you set up once. It stays in this browser.',
    steps: ['Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → new token</a> (fine-grained).',
      'Repository access: <b>Only select repositories</b> → <code>urbanindustry</code>.',
      'Permissions → Repository → <b>Contents: Read and write</b>.', '<b>Generate token</b>, copy it (it starts with <code>github_pat_</code>) and paste it here.'],
    key: 'Key', repoAdv: 'Repository', signInGo: 'Sign in', badKey: "That key didn't work.", noRepo: r => `This key can't see ${r}.`,
    publishGo: 'Publish', discard: 'Discard changes', confirmDiscard: 'Throw away all unpublished changes?',
    needSignIn: 'Sign in to publish.', publishing: 'Publishing…', published: 'Published. The site updates in about a minute.',
    live: 'Live on the site ✓', nothing: 'Nothing to publish.',
    conflict: 'Someone published in the meantime. Reload to get their version — your changes stay in this browser.',
    noWrite: 'This key can read but not publish — it needs Contents: Read and write.', failed: e => `Couldn't publish: ${e}`,
    chAdded: n => `Added: ${n}`, chDeleted: n => `Deleted: ${n}`, chOn: n => `Put on the wall: ${n}`, chOff: n => `Taken off the wall: ${n}`,
    chOrder: 'New order on the wall', fPrice: (a, b) => `price ${a} → ${b} ₾`, fSizes: 'sizes', fPhoto: 'photo', fText: 'text',
    discarded: 'Changes discarded.', saved: 'Saved — in this browser for now.', previewHint: 'The preview opens in a new tab — only you see it.',
  },
};
let lang = local.get('lang', 'ka');
const t = (k, ...a) => { const v = T[lang][k] ?? T.en[k]; return typeof v === 'function' ? v(...a) : v; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- state
let base = { pairs: [], archive: [] };   // what's published
let baseSha = null;                      // docs/catalog.json's blob, when signed in (to catch a publish in between)
let cat = { pairs: [], archive: [] };    // the working copy
let newFiles = new Set();                // pictures in this browser that aren't published yet (IndexedDB keys)
const held = new Set();                  // published, but the site may not serve them yet: shown from here till it does
let gh = null, me = null, keyFailed = false;
const clone = o => JSON.parse(JSON.stringify(o));
const norm = c => ({ pairs: (c && c.pairs) || [], archive: (c && c.archive) || [] });
const name = p => `${p.brand} ${p.model}`.trim();
const allPairs = () => [...cat.pairs, ...cat.archive];
const repoName = () => local.get('repo') || DEFAULT_REPO;

function saveDraft() {
  if (!changes().length && !newFiles.size) { local.set('draft', null); return; }
  local.set('draft', { catalog: cat, baseSha, files: [...newFiles], at: Date.now() });
}

// ---------------------------------------------------------------- pictures
const urls = new Map();   // IndexedDB key -> object URL
async function fileURL(key) {
  if (urls.has(key)) return urls.get(key);
  const blob = await files.get(key);
  if (!blob) return null;
  const u = URL.createObjectURL(blob); urls.set(key, u); return u;
}
function dropURL(key) { const u = urls.get(key); if (u) { URL.revokeObjectURL(u); urls.delete(key); } }
const local_ = key => newFiles.has(key) || held.has(key);
async function shoeURL(p, size) {
  if (local_(`shoes/${p.id}-${size}`)) { const u = await fileURL(`shoes/${p.id}-${size}`); if (u) return u; }
  return `${SITE}assets/shoes/${p.id}-${size}.${p.ext || 'webp'}${p.v ? `?v=${p.v}` : ''}`;
}
async function photoURL(ph, thumb) {
  const key = `photos/${ph.src}${thumb ? '-t' : ''}`;
  if (local_(key)) { const u = await fileURL(key); if (u) return u; }
  return `${SITE}assets/photos/${ph.src}${thumb ? '-t' : ''}.${ph.ext || 'webp'}`;
}
const hash8 = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()))].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- what changed since the last publish
function changes() {
  const index = c => new Map([...c.pairs.map(p => [p.id, { p, wall: true }]), ...c.archive.map(p => [p.id, { p, wall: false }])]);
  const A = index(base), B = index(cat), out = [];
  for (const [id, b] of B) {
    const a = A.get(id);
    if (!a) { out.push(t('chAdded', name(b.p))); continue; }
    if (a.wall !== b.wall) out.push(b.wall ? t('chOn', name(b.p)) : t('chOff', name(b.p)));
    const f = [], same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    if (a.p.price !== b.p.price) f.push(t('fPrice', a.p.price, b.p.price));
    if (!same([a.p.sizes, a.p.soldOut], [b.p.sizes, b.p.soldOut])) f.push(t('fSizes'));
    if (a.p.v !== b.p.v || a.p.ext !== b.p.ext) f.push(t('fPhoto'));
    if (name(a.p) !== name(b.p) || !same(a.p.color, b.p.color) || !same(a.p.desc, b.p.desc) || !same(a.p.photos, b.p.photos)) f.push(t('fText'));
    if (f.length) out.push(`${name(b.p)}: ${f.join(', ')}`);
  }
  for (const [id, a] of A) if (!B.has(id)) out.push(t('chDeleted', name(a.p)));
  const order = (c, other) => c.pairs.map(p => p.id).filter(id => other.has(id) && other.get(id).wall).join();
  if (order(base, B) !== order(cat, A)) out.push(t('chOrder'));
  return out;
}
const isChanged = p => { const a = [...base.pairs, ...base.archive].find(x => x.id === p.id); return !a || JSON.stringify(a) !== JSON.stringify(p); };

// ---------------------------------------------------------------- rendering
function applyLang() {
  html.lang = lang; document.title = t('title');
  $$('[data-t]').forEach(el => { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v; });
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('#si-steps').innerHTML = t('steps').map(s => `<li>${s}</li>`).join('');
  render();
}
$$('.lang button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; local.set('lang', lang); applyLang(); if (ed) fillEditor(); }));

function renderAccount() {
  const el = $('#account');
  if (gh && me) {
    el.className = 'account live';
    el.innerHTML = `<p><span class="dot"></span>${t('signedIn', esc(me), esc(repoName()))}</p><button type="button" class="btn ghost" id="sign-out">${t('signOut')}</button>`;
    $('#sign-out').onclick = () => { local.set('token', null); local.set('login', null); gh = null; me = null; baseSha = null; renderAccount(); };
  } else {
    el.className = 'account';
    el.innerHTML = `<p><span class="dot"></span>${keyFailed ? t('keyFailed') : t('demo')}</p><button type="button" class="btn" id="sign-in">${t('signInCta')}</button>`;
    $('#sign-in').onclick = () => openSheet('signin');
  }
}

function render() {
  renderAccount();
  $('#wall-sub').textContent = t('wallSub', cat.pairs.length);
  $('#add').disabled = false;
  renderGrid($('#wall'), cat.pairs, true);
  renderGrid($('#archive'), cat.archive, false);
  $('#archive-empty').hidden = cat.archive.length > 0;
  const ch = changes();
  $('#dock').classList.toggle('on', ch.length > 0);
  $('#dock-note').innerHTML = t('changes', ch.length);
}

function renderGrid(ol, list, wall) {
  ol.innerHTML = '';
  list.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'card' + (isChanged(p) ? ' changed' : '');
    const out = p.soldOut.length, sizes = p.sizes.length - out;
    li.innerHTML = `
      <div class="pic"><img alt="" loading="lazy" decoding="async">${wall ? `<span class="num">${String(i + 1).padStart(2, '0')}</span>` : ''}${p.id === INTRO ? `<span class="badge">${t('intro')}</span>` : ''}</div>
      <div class="meta"><span class="kick">${esc(p.brand)}</span><b>${esc(p.model)}</b>
        <span class="line"><span>${t('sizesSum', sizes, out)}</span><span class="price">${esc(p.price)} ₾</span></span></div>
      <button type="button" class="open" aria-label="${esc(t('editPair'))}: ${esc(name(p))}"></button>
      <div class="ord">${wall
        ? `<button type="button" data-mv="-1" aria-label="${t('earlier')}" ${i === 0 ? 'disabled' : ''}>←</button><button type="button" data-mv="1" aria-label="${t('later')}" ${i === list.length - 1 ? 'disabled' : ''}>→</button>`
        : `<button type="button" class="txt" data-on>${t('putOn')}</button>`}</div>`;
    shoeURL(p, 512).then(u => { li.querySelector('img').src = u; });
    li.querySelector('.open').onclick = () => openEditor(p.id);
    li.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => move(p.id, +b.dataset.mv));
    const on = li.querySelector('[data-on]'); if (on) on.onclick = () => putOn(p.id);
    ol.append(li);
  });
}

function move(id, d) {
  const i = cat.pairs.findIndex(p => p.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= cat.pairs.length) return;
  [cat.pairs[i], cat.pairs[j]] = [cat.pairs[j], cat.pairs[i]];
  saveDraft(); render();
}
function putOn(id) {
  if (cat.pairs.length >= MAX) { toast(t('wallFull')); return; }
  const i = cat.archive.findIndex(p => p.id === id); if (i < 0) return;
  cat.pairs.push(cat.archive.splice(i, 1)[0]);
  saveDraft(); render();
}
function takeOff(id) {
  if (id === INTRO) { toast(t('introLocked')); return false; }
  const i = cat.pairs.findIndex(p => p.id === id); if (i < 0) return false;
  cat.archive.unshift(cat.pairs.splice(i, 1)[0]);
  saveDraft(); render(); return true;
}

// ---------------------------------------------------------------- sheets
let lastFocus = null;
function openSheet(id) {
  lastFocus = document.activeElement;
  const el = $('#' + id); el.hidden = false;
  setTimeout(() => (el.querySelector('input:not([type=file]):not([type=range])') || el.querySelector('.x'))?.focus({ preventScroll: true }), 60);
  document.body.style.overflow = 'hidden';
}
function closeSheet(id) {
  const el = $('#' + id); if (el.hidden) return false;
  el.hidden = true; document.body.style.overflow = '';
  if (id === 'editor') ed = null;
  lastFocus?.focus?.({ preventScroll: true });
  return true;
}
$$('.sheet').forEach(s => {
  s.addEventListener('click', e => { if (e.target === s) closeSheet(s.id); });
  s.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheet(s.id));
});
addEventListener('keydown', e => { if (e.key === 'Escape') ['pub', 'signin', 'editor'].some(closeSheet); });

let toastT = 0;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }

// ---------------------------------------------------------------- the editor
let ed = null;   // { id, isNew, wall, d (the pair), pic (a new photo being cut), feedNew }
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'pair';
function freshId(p) {
  const taken = new Set([...allPairs(), ...base.pairs, ...base.archive].map(x => x.id));
  let id; do { id = `${slug(name(p))}_${Math.random().toString(36).slice(2, 6)}`; } while (taken.has(id));
  return id;
}

function openEditor(id) {
  const where = cat.pairs.find(p => p.id === id) ? 'pairs' : 'archive';
  const p = id ? allPairs().find(x => x.id === id) : null;
  ed = p
    ? { id, isNew: false, wall: where === 'pairs', d: clone(p), pic: null }
    : { id: null, isNew: true, wall: cat.pairs.length < MAX, d: { brand: '', model: '', color: { ka: '', en: '' }, desc: { ka: '', en: '' }, price: 0, sizes: [], soldOut: [], photos: [] }, pic: null };
  fillEditor();
  openSheet('editor');
}

function fillEditor() {
  const d = ed.d;
  $('#ed-title').textContent = ed.isNew ? t('newPair') : t('editPair');
  $('#f-brand').value = d.brand; $('#f-model').value = d.model;
  $('#f-color-ka').value = d.color.ka || ''; $('#f-color-en').value = d.color.en || '';
  $('#f-price').value = d.price || '';
  $('#f-desc-ka').value = d.desc.ka || ''; $('#f-desc-en').value = d.desc.en || '';
  $('#ed-err').textContent = '';
  // sizes: off -> in stock -> sold out
  const box = $('#f-sizes'); box.innerHTML = '';
  for (const s of SIZES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sz'; b.textContent = s;
    const state = () => (d.soldOut.includes(s) ? 'out' : d.sizes.includes(s) ? 'on' : 'off');
    const show = () => { const st = state(); b.dataset.s = st; b.setAttribute('aria-label', `${s}: ${st === 'on' ? t('inStock') : st === 'out' ? t('soldOut') : '—'}`); };
    b.onclick = () => {
      const st = state();
      if (st === 'off') d.sizes.push(s);
      else if (st === 'on') d.soldOut.push(s);
      else { d.sizes = d.sizes.filter(x => x !== s); d.soldOut = d.soldOut.filter(x => x !== s); }
      d.sizes.sort((x, y) => x - y); d.soldOut.sort((x, y) => x - y);
      show();
    };
    show(); box.append(b);
  }
  renderFeed();
  // the picture: the one being cut, else the pair's current one
  const st = $('#stage'), im = $('#stage-img');
  $('#pic-tune').hidden = !ed.pic;
  $('#remove-bg').checked = !(ed.pic && ed.pic.keepBg);   // ticked: the background comes off
  $('#rotate').value = ed.pic ? ed.pic.rotate : 0; $('#tol').value = ed.pic ? ed.pic.tol : 1;
  $('#tol').closest('label').hidden = !!(ed.pic && ed.pic.keepBg);
  $('#pic-note').textContent = ed.pic ? ed.pic.note || '' : '';
  $('label[for=photo] span').textContent = ed.pic || !ed.isNew ? t('change') : t('choose');
  if (ed.pic && ed.pic.url) { im.src = ed.pic.url; st.classList.add('has'); }
  else if (!ed.isNew) { shoeURL(d.id ? d : { ...d, id: ed.id }, 1024).then(u => { if (ed && !ed.pic) { im.src = u; st.classList.add('has'); } }); }
  else { im.removeAttribute('src'); st.classList.remove('has'); }
  // where it lives: off the wall / back on it; the intro pair stays up
  const mv = $('#ed-move');
  mv.hidden = ed.isNew || ed.id === INTRO;
  mv.textContent = ed.wall ? t('takeOff') : t('putOn');
  $('#ed-delete').hidden = ed.isNew || ed.id === INTRO;
}

function renderFeed() {
  const box = $('#f-feed'); box.innerHTML = '';
  ed.d.photos.forEach((ph, k) => {
    const el = document.createElement('div'); el.className = 'ph';
    el.innerHTML = `<img alt=""><button type="button" aria-label="×">×</button>`;
    photoURL(ph, true).then(u => { el.querySelector('img').src = u; });
    el.querySelector('button').onclick = () => { ed.d.photos.splice(k, 1); renderFeed(); };
    box.append(el);
  });
  if (ed.d.photos.length < 4) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'add'; add.textContent = '+';
    add.onclick = () => $('#feed-photo').click();
    box.append(add);
  }
}

function busy(htmlText) {
  const b = $('#stage-busy');
  if (htmlText == null) { b.hidden = true; return; }
  b.hidden = false; $('#busy-text').innerHTML = htmlText;
}

// a new photo: read it, find the pair (the model, first time it downloads), cut, lay out
$('#photo').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file || !ed) return;
  const mine = ed;
  busy(t('finding'));
  try {
    const src = await decode(file);
    const pic = { src, prob: null, flip: false, rotate: 0, tol: 1, keepBg: hasAlpha(src), note: '' };
    if (!pic.keepBg) {
      try { pic.prob = await findPair(src, VENDOR, p => busy(t('loadingModel', Math.round(p * 100)))); }
      catch (err) { console.warn(err); pic.note = t('plainOnly'); }
    }
    if (ed !== mine) return;
    busy(t('finding'));
    await new Promise(r => setTimeout(r, 20));
    ed.pic = pic;
    recut();
  } catch (err) {
    console.error(err);
    $('#ed-err').textContent = t('readFailed');
  } finally { busy(null); }
});
function recut() {
  const P = ed.pic;
  P.cut = P.keepBg ? { data: P.src.data, w: P.src.w, h: P.src.h, plain: true } : cut(P.src, { prob: P.prob, tolerance: P.tol });
  if (!P.keepBg && !P.cut.plain && !P.note) P.note = t('busyBg');
  relayer();
}
function relayer() {
  const P = ed.pic;
  try { P.layer = layer(P.cut, { flip: P.flip, rotate: P.rotate }); } catch (e) { P.layer = null; $('#ed-err').textContent = t('readFailed'); return; }
  P.layer.hi.toBlob(b => {
    if (!ed || ed.pic !== P) return;
    if (P.url) URL.revokeObjectURL(P.url);
    P.url = URL.createObjectURL(b);
    fillEditor();
  });
}
$('#flip').onclick = () => { if (ed && ed.pic) { ed.pic.flip = !ed.pic.flip; relayer(); } else if (ed && !ed.isNew) { flipExisting(); } };
$('#rotate').addEventListener('input', e => { if (ed && ed.pic) { ed.pic.rotate = +e.target.value; relayer(); } });
let tolT = 0;
$('#tol').addEventListener('input', e => { if (!ed || !ed.pic) return; ed.pic.tol = +e.target.value; clearTimeout(tolT); tolT = setTimeout(recut, 120); });
$('#remove-bg').addEventListener('change', e => { if (ed && ed.pic) { ed.pic.keepBg = !e.target.checked; recut(); } });
// an existing pair, mirrored: take its current picture through the same layout, flipped
async function flipExisting() {
  const url = await shoeURL({ ...ed.d, id: ed.id }, 1024);
  const blob = await fetch(url).then(r => r.blob());
  const src = await decode(new File([blob], 'pair.png', { type: blob.type }));
  ed.pic = { src, prob: null, flip: true, rotate: 0, tol: 1, keepBg: true, note: '' };
  recut();
}

$('#feed-photo').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file || !ed) return;
  try {
    const ph = await feedPhoto(file);
    const id = ed.id || (ed.id = freshId(ed.d));
    const src = `${id}_${Math.random().toString(36).slice(2, 7)}`;
    await files.put(`photos/${src}`, ph.full); await files.put(`photos/${src}-t`, ph.thumb);
    newFiles.add(`photos/${src}`); newFiles.add(`photos/${src}-t`);
    ed.d.photos.push({ src, w: ph.w, h: ph.h, ext: ph.ext });
    renderFeed();
  } catch (err) { console.error(err); $('#ed-err').textContent = t('readFailed'); }
});

function readForm() {
  const d = ed.d;
  d.brand = $('#f-brand').value.trim(); d.model = $('#f-model').value.trim();
  d.color = { ka: $('#f-color-ka').value.trim(), en: $('#f-color-en').value.trim() };
  d.desc = { ka: $('#f-desc-ka').value.trim(), en: $('#f-desc-en').value.trim() };
  d.price = Math.round(Number(String($('#f-price').value).replace(/[^\d.]/g, '')) || 0);
}
$('#ed-done').addEventListener('click', async () => {
  if (!ed) return;
  readForm();
  const d = ed.d, err = $('#ed-err');
  if (!d.brand || !d.model) { err.textContent = t('errName'); return; }
  if (!d.price) { err.textContent = t('errPrice'); return; }
  if (!d.sizes.length) { err.textContent = t('errSizes'); return; }
  if (ed.isNew && !(ed.pic && ed.pic.layer)) { err.textContent = t('errPhoto'); return; }
  const btn = $('#ed-done'); btn.disabled = true; busy(t('saving'));
  try {
    const id = ed.id || (ed.id = freshId(d));
    d.id = id;
    if (ed.pic && ed.pic.layer) {
      // the layer and its half-size copy, kept here until they're published
      const hi = await encode(ed.pic.layer.hi), lo = await encode(ed.pic.layer.lo);
      for (const [size, x] of [[1024, hi], [512, lo]]) { const key = `shoes/${id}-${size}`; dropURL(key); await files.put(key, x.blob); newFiles.add(key); }
      d.ext = hi.ext; d.rect = ed.pic.layer.rect; d.base = ed.pic.layer.base; d.v = await hash8(hi.blob);
    }
    d.color.en ||= d.color.ka; d.color.ka ||= d.color.en;
    const wentOff = ed.isNew && !ed.wall;
    if (ed.isNew) {
      if (ed.wall) cat.pairs.unshift(d); else cat.archive.unshift(d);
    } else {
      for (const list of [cat.pairs, cat.archive]) { const i = list.findIndex(p => p.id === id); if (i >= 0) list[i] = d; }
    }
    saveDraft();
    closeSheet('editor'); render();
    toast(wentOff ? t('wentOff') : t('saved'));
  } catch (e) {
    console.error(e); err.textContent = String(e.message || e);
  } finally { btn.disabled = false; busy(null); }
});
$('#ed-move').addEventListener('click', () => {
  if (!ed) return;
  const id = ed.id;
  if (ed.wall) { if (takeOff(id)) closeSheet('editor'); }
  else if (cat.pairs.length >= MAX) toast(t('wallFull'));
  else { putOn(id); closeSheet('editor'); }
});
$('#ed-delete').addEventListener('click', () => {
  if (!ed || ed.id === INTRO) return;
  if (!confirm(t('confirmDelete', name(ed.d)))) return;
  cat.pairs = cat.pairs.filter(p => p.id !== ed.id); cat.archive = cat.archive.filter(p => p.id !== ed.id);
  saveDraft(); closeSheet('editor'); render();
});
$('#add').addEventListener('click', () => openEditor(null));

// ---------------------------------------------------------------- preview: the real site, with this draft
$('#preview').addEventListener('click', () => { saveDraft(); toast(t('previewHint')); window.open(`${SITE}?draft&noreel&lang=${lang}`, '_blank', 'noopener'); });

// ---------------------------------------------------------------- sign in
$('#si-repo').value = repoName();
$('#si-go').addEventListener('click', async () => {
  const token = $('#si-token').value.trim(), repo = $('#si-repo').value.trim() || DEFAULT_REPO, err = $('#si-err');
  err.textContent = '';
  if (!token) { err.textContent = t('badKey'); return; }
  const [owner, name_] = repo.split('/');
  const btn = $('#si-go'); btn.disabled = true;
  try {
    const g = github({ owner, repo: name_, token, api: API });
    let user;
    try { user = await g.user(); } catch (e) { err.textContent = t('badKey'); return; }
    try { await g.info(); } catch (e) { err.textContent = t('noRepo', repo); return; }
    local.set('token', token); local.set('repo', repo); local.set('login', user.login);
    gh = g; me = user.login; keyFailed = false;
    const { sha, json } = await gh.readJSON('docs/catalog.json');
    baseSha = sha;
    // their published catalog is the base now; the draft (if any) carries on on top of it
    const had = changes().length;
    base = norm(json);
    if (!had && !newFiles.size) cat = clone(base);
    saveDraft();
    closeSheet('signin'); render();
  } catch (e) { console.error(e); err.textContent = String(e.message || e); }
  finally { btn.disabled = false; }
});

// ---------------------------------------------------------------- publish
$('#publish').addEventListener('click', () => {
  if (!gh) { toast(t('needSignIn')); openSheet('signin'); return; }
  const ch = changes();
  $('#pub-list').innerHTML = ch.length ? ch.map(c => `<li>${esc(c)}</li>`).join('') : `<li>${t('nothing')}</li>`;
  $('#pub-err').textContent = ''; $('#pub-note').textContent = ''; $('#pub-progress').hidden = true;
  $('#pub-go').disabled = !ch.length; $('#pub-discard').hidden = !ch.length;
  openSheet('pub');
});
$('#pub-discard').addEventListener('click', async () => {
  if (!confirm(t('confirmDiscard'))) return;
  cat = clone(base);
  for (const k of newFiles) { dropURL(k); await files.del(k); }
  newFiles.clear(); saveDraft(); closeSheet('pub'); render(); toast(t('discarded'));
});
$('#pub-go').addEventListener('click', async () => {
  const ch = changes(); if (!ch.length || !gh) return;
  const btn = $('#pub-go'), bar = $('#pub-progress'), err = $('#pub-err');
  btn.disabled = true; err.textContent = ''; bar.hidden = false; bar.firstElementChild.style.width = '4%';
  $('#pub-note').textContent = t('publishing');
  try {
    const stamp = new Date().toISOString();
    const out = { updated: stamp, pairs: cat.pairs, archive: cat.archive };
    const json = JSON.stringify(out, null, 1) + '\n';
    // the catalog where the site reads it (docs/) and where the build reads it (src/); pictures in both too
    const list = [{ path: 'docs/catalog.json', text: json }, { path: 'src/catalog.json', text: json }];
    const used = new Set();
    for (const p of allPairs()) {
      for (const size of [1024, 512]) used.add(`shoes/${p.id}-${size}|${p.ext || 'webp'}`);
      for (const ph of p.photos) { used.add(`photos/${ph.src}|${ph.ext || 'webp'}`); used.add(`photos/${ph.src}-t|${ph.ext || 'webp'}`); }
    }
    const sent = [];
    for (const u of used) {
      const [key, ext] = u.split('|');
      if (!newFiles.has(key)) continue;
      const blob = await files.get(key); if (!blob) continue;
      list.push({ path: `docs/assets/${key}.${ext}`, blob }, { path: `assets/${key}.${ext}`, blob });
      sent.push(key);
    }
    const was = lang; lang = 'en'; const en = changes(); lang = was;   // the repository's history reads in English
    const msg = `Wall: ${en.slice(0, 3).join('; ')}${en.length > 3 ? ` (+${en.length - 3} more)` : ''}`;
    const res = await gh.commit(list, msg, {
      expect: baseSha ? { path: 'docs/catalog.json', sha: baseSha } : null,
      onProgress: f => { bar.firstElementChild.style.width = `${Math.round(6 + f * 94)}%`; },
    });
    base = clone(cat); baseSha = res.blobs['docs/catalog.json'];
    for (const k of sent) { newFiles.delete(k); held.add(k); }
    for (const k of [...newFiles]) if (![...used].some(u => u.startsWith(k + '|'))) { newFiles.delete(k); dropURL(k); files.del(k).catch(() => {}); }
    saveDraft(); render();
    $('#pub-note').textContent = t('published');
    $('#pub-list').innerHTML = ch.map(c => `<li>${esc(c)}</li>`).join('');
    $('#pub-discard').hidden = true;
    watchLive(stamp, sent);
  } catch (e) {
    console.error(e);
    $('#pub-note').textContent = '';
    err.textContent = e instanceof Conflict ? t('conflict') : e.status === 403 || e.status === 404 ? t('noWrite') : t('failed', e.detail || e.message);
    btn.disabled = false;
  }
});
// when the deployed catalog carries this publish's stamp, it's live: the pictures can leave this browser
async function watchLive(stamp, sent) {
  for (let k = 0; k < 40; k++) {
    await new Promise(r => setTimeout(r, k ? 6000 : 15000));
    try {
      const c = await fetch(`${SITE}catalog.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json());
      if (c.updated === stamp) {
        toast(t('live')); $('#pub-note').textContent = t('live');
        for (const key of sent) { held.delete(key); if (!newFiles.has(key)) { dropURL(key); await files.del(key); } }
        render();
        return;
      }
    } catch (e) {}
  }
}

// ---------------------------------------------------------------- start
async function boot() {
  applyLang();
  const token = local.get('token');
  if (token) {
    const [owner, repo] = repoName().split('/');
    try {
      gh = github({ owner, repo, token, api: API });
      const { sha, json } = await gh.readJSON('docs/catalog.json');
      base = norm(json); baseSha = sha; me = local.get('login');
    } catch (e) { console.warn(e); gh = null; me = null; keyFailed = true; }
  }
  if (!gh) {
    try { base = norm(await fetch(`${SITE}catalog.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json())); }
    catch (e) { base = norm(null); }
  }
  const d = local.get('draft');
  if (d && d.catalog) { cat = norm(d.catalog); newFiles = new Set(d.files || []); }
  else cat = clone(base);
  // pictures this browser holds that nothing refers to any more (a cancelled edit) are let go
  const keep = new Set(newFiles);
  for (const k of await files.keys().catch(() => [])) if (!keep.has(k)) files.del(k).catch(() => {});
  render();
}
boot();
window.__admin = { get cat() { return cat; }, get base() { return base; }, changes, get newFiles() { return newFiles; } };
