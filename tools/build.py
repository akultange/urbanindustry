"""Build dist/: bundle JS with esbuild, subset + inline fonts, inline CSS/catalog into index.html,
copy assets. usage: python3 tools/build.py [public_base_url]"""
import os, sys, re, json, shutil, subprocess, base64, io, hashlib
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, os.environ.get('OUT', 'dist'))
NM = os.path.join(ROOT, 'node_modules')
PUBLIC = sys.argv[1] if len(sys.argv) > 1 else ''


def font_subset(path, text=None, unicodes=None, keep_axes=True):
    f = TTFont(path, recalcTimestamp=False)  # same bytes every build, so the hashed font URLs stay cached
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'calt', 'tnum', 'lnum', 'ccmp', 'locl', 'mark', 'mkmk']
    opts.name_IDs = []
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(text=text or '', unicodes=unicodes or [])
    s.subset(f)
    buf = io.BytesIO()
    f.flavor = 'woff2'
    f.save(buf)
    return buf.getvalue()


def fonts():
    fs = {}
    ka = os.path.join(NM, '@fontsource-variable/noto-sans-georgian/files/noto-sans-georgian-georgian-wdth-normal.woff2')
    ka_ext = os.path.join(NM, '@fontsource-variable/noto-sans-georgian/files/noto-sans-georgian-latin-ext-wdth-normal.woff2')
    rb = os.path.join(NM, '@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2')
    it = os.path.join(NM, '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2')
    mkhedruli = list(range(0x10D0, 0x1100))
    latin = list(range(0x20, 0x7F)) + [0xA0, 0xB7, 0xD7, 0xE7, 0xE9, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2032]
    # (data, unicode-range, family, weight range, stretch?)
    fs['nsg'] = (font_subset(ka, unicodes=mkhedruli + [0x20, 0x2D, 0x2014, 0x201E, 0x201C, 0x2026]), 'U+10D0-10FF, U+201E, U+201C', 'NSG', '100 900', True)
    fs['lari'] = (font_subset(ka_ext, unicodes=[0x20BE]), 'U+20BE', 'NSG', '100 900', True)
    fs['rb'] = (font_subset(rb, unicodes=latin), 'U+0020-007E, U+00A0, U+00B7, U+00D7, U+00E7, U+00E9, U+2013-201D, U+2026, U+2032', 'RB', '300 900', False)
    # Rubik has no arrows: borrow them from Inter Tight
    fs['arw'] = (font_subset(it, unicodes=[0x2190, 0x2191, 0x2192, 0x2193, 0x2196, 0x2197, 0x2198]), 'U+2190-2198', 'IT', '100 900', False)
    css = []
    preload = []
    os.makedirs(os.path.join(DIST, 'assets', 'fonts'), exist_ok=True)
    for k, (data, rng, fam, weight, stretch) in fs.items():
        h = hashlib.md5(data).hexdigest()[:8]
        name = f'{k}.{h}.woff2'
        open(os.path.join(DIST, 'assets', 'fonts', name), 'wb').write(data)
        st = 'font-stretch: 62.5% 100%;' if stretch else ''
        css.append(f"@font-face{{font-family:'{fam}';src:url(assets/fonts/{name}) format('woff2');font-weight:{weight};{st}font-display:swap;unicode-range:{rng}}}")
        if k in ('nsg', 'rb'):
            preload.append(f'<link rel="preload" href="assets/fonts/{name}" as="font" type="font/woff2" crossorigin>')
        print(f'  font {k:5s} {len(data) / 1024:6.1f} KB')
    return '\n'.join(css), preload


def logo():
    """Their wordmark as inline SVG for the header, and a favicon from its first letter."""
    L = json.load(open(os.path.join(SRC, 'logo.json')))
    svg = f'<svg class="logo" viewBox="0 0 {L["w"]} {L["h"]}" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="{L["d"]}"/></svg>'
    # the "U": subpaths whose points all sit in the first ~11% of the width
    subs = re.findall(r'M[^M]*', L['d'])
    def xs(p): return [float(m[0]) for m in re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', p)]
    u = ''.join(p for p in subs if max(xs(p)) < L['w'] * 0.11)
    pts = [tuple(map(float, m)) for m in re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', u)]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    size = max(x1 - x0, y1 - y0) / 0.6
    vb = f'{(x0 + x1) / 2 - size / 2:.2f} {(y0 + y1) / 2 - size / 2:.2f} {size:.2f} {size:.2f}'
    r = size * 0.22
    fav = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='{vb}'><rect x='{(x0 + x1) / 2 - size / 2:.2f}' y='{(y0 + y1) / 2 - size / 2:.2f}' width='{size:.2f}' height='{size:.2f}' rx='{r:.2f}' fill='#a2c1f0'/>"
           f"<path fill='#fff' fill-rule='evenodd' d='{u}'/></svg>")
    from urllib.parse import quote
    return svg, 'data:image/svg+xml,' + quote(fav, safe=" =:/'")


def main():
    if os.path.exists(DIST): shutil.rmtree(DIST)
    os.makedirs(DIST)
    print('fonts')
    font_css, preload = fonts()
    # assets
    for d in ('shoes', 'photos', 'img', 'reel'):
        s = os.path.join(ROOT, 'assets', d)
        if os.path.isdir(s): shutil.copytree(s, os.path.join(DIST, 'assets', d))
    # js
    js = subprocess.run([os.path.join(NM, '.bin', 'esbuild'), os.path.join(SRC, 'app.js'), '--bundle', '--minify', '--format=iife', '--target=es2020', '--legal-comments=none'],
                        capture_output=True, text=True, check=True).stdout
    css = open(os.path.join(SRC, 'style.css')).read().replace('%FONTS%', font_css)
    css = subprocess.run([os.path.join(NM, '.bin', 'esbuild'), '--loader=css', '--minify'], input=css, capture_output=True, text=True, check=True).stdout
    cat = json.load(open(os.path.join(SRC, 'catalog.json')))
    # a content hash per pair, so a re-cut picture never comes out of an old cache
    import hashlib
    for p in cat['pairs']:
        h = hashlib.sha1()
        for size in (512, 1024):
            with open(os.path.join(ROOT, 'assets', 'shoes', f'{p["id"]}-{size}.webp'), 'rb') as f: h.update(f.read())
        p['v'] = h.hexdigest()[:8]
    html = open(os.path.join(SRC, 'index.html')).read()
    # everything here is read with fetch() + createImageBitmap, so preload as fetch (not image)
    pre = lambda href, hi=False: f'<link rel="preload" href="{href}" as="fetch" crossorigin{" fetchpriority=" + chr(34) + "high" + chr(34) if hi else ""}>'
    anchor = next(p for p in cat['pairs'] if p['id'] == 'dunk')
    shoes = [pre(f'assets/shoes/{anchor["id"]}-1024.webp?v={anchor["v"]}', True)]
    shoes += [pre(f'assets/shoes/{p["id"]}-512.webp?v={p["v"]}') for p in cat['pairs']]
    shoes += [pre(f'assets/reel/{n}.webp') for n in ('dunk-lines', 'held', 'box')]
    logo_svg, fav = logo()
    og = (PUBLIC.rstrip('/') + '/' if PUBLIC else '') + 'assets/img/og.jpg'
    html = (html.replace('%CSS%', css).replace('%JS%', js.replace('</script', '<\\/script'))
            .replace('%CATALOG%', json.dumps(cat, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
            .replace('%PRELOAD%', '\n'.join(preload + shoes)).replace('%FAVICON%', fav).replace('%OG_IMAGE%', og).replace('%LOGO%', logo_svg))
    open(os.path.join(DIST, 'index.html'), 'w').write(html)
    open(os.path.join(DIST, '.nojekyll'), 'w').write('')
    sz = lambda p: os.path.getsize(p)
    print(f'index.html {sz(os.path.join(DIST, "index.html")) / 1024:.1f} KB (js {len(js) / 1024:.1f} KB, css {len(css) / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
