"""Build dist/: bundle JS with esbuild, subset + inline fonts, inline CSS/catalog into index.html,
copy assets. usage: python3 tools/build.py [public_base_url]"""
import os, sys, json, shutil, subprocess, base64, io, hashlib
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, os.environ.get('OUT', 'dist'))
NM = os.path.join(ROOT, 'node_modules')
PUBLIC = sys.argv[1] if len(sys.argv) > 1 else ''


def font_subset(path, text=None, unicodes=None, keep_axes=True):
    f = TTFont(path)
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
    it = os.path.join(NM, '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2')
    jb = os.path.join(NM, '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')
    rb = os.path.join(NM, '@fontsource/rubik/files/rubik-latin-500-normal.woff2')
    mkhedruli = list(range(0x10D0, 0x1100))
    fs['nsg'] = (font_subset(ka, unicodes=mkhedruli + [0x20, 0x2D, 0x2014, 0x201E, 0x201C, 0x2026]), 'U+10D0-10FF, U+201E, U+201C', 'NSG', '100 900', True)
    fs['lari'] = (font_subset(ka_ext, unicodes=[0x20BE]), 'U+20BE', 'NSG', '100 900', True)
    fs['it'] = (font_subset(it, unicodes=list(range(0x20, 0x7F)) + [0xA0, 0xD7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2190, 0x2192, 0x2197, 0x2032, 0xE7]),
                'U+0020-007E, U+00A0, U+00D7, U+00E7, U+2013-201D, U+2026, U+2190-2197, U+2032', 'IT', '100 900', True)
    fs['jbm'] = (font_subset(jb, unicodes=list(range(0x20, 0x7F)) + [0xD7, 0x2192, 0x2190, 0x2197]), 'U+0020-007E, U+00D7, U+2190-2197', 'JBM', '500', False)
    fs['rb'] = (font_subset(rb, text='Urban Industry'), 'U+0020, U+0055, U+0049, U+0061-007A', 'RB', '500', False)
    css = []
    preload = []
    os.makedirs(os.path.join(DIST, 'assets', 'fonts'), exist_ok=True)
    for k, (data, rng, fam, weight, var) in fs.items():
        h = hashlib.md5(data).hexdigest()[:8]
        name = f'{k}.{h}.woff2'
        open(os.path.join(DIST, 'assets', 'fonts', name), 'wb').write(data)
        stretch = 'font-stretch: 62.5% 100%;' if k in ('nsg', 'lari') else ''
        css.append(f"@font-face{{font-family:'{fam}';src:url(assets/fonts/{name}) format('woff2');font-weight:{weight};{stretch}font-display:swap;unicode-range:{rng}}}")
        if k in ('nsg', 'it', 'rb'):
            preload.append(f'<link rel="preload" href="assets/fonts/{name}" as="font" type="font/woff2" crossorigin>')
        print(f'  font {k:5s} {len(data) / 1024:6.1f} KB')
    return '\n'.join(css), preload


def main():
    if os.path.exists(DIST): shutil.rmtree(DIST)
    os.makedirs(DIST)
    print('fonts')
    font_css, preload = fonts()
    # assets
    for d in ('shoes', 'photos', 'img'):
        s = os.path.join(ROOT, 'assets', d)
        if os.path.isdir(s): shutil.copytree(s, os.path.join(DIST, 'assets', d))
    # js
    js = subprocess.run([os.path.join(NM, '.bin', 'esbuild'), os.path.join(SRC, 'app.js'), '--bundle', '--minify', '--format=iife', '--target=es2020', '--legal-comments=none'],
                        capture_output=True, text=True, check=True).stdout
    css = open(os.path.join(SRC, 'style.css')).read().replace('%FONTS%', font_css)
    css = subprocess.run([os.path.join(NM, '.bin', 'esbuild'), '--loader=css', '--minify'], input=css, capture_output=True, text=True, check=True).stdout
    cat = json.load(open(os.path.join(SRC, 'catalog.json')))
    html = open(os.path.join(SRC, 'index.html')).read()
    shoes = [f'<link rel="preload" href="assets/shoes/{p["id"]}-512.webp" as="image" fetchpriority="high">' for p in cat['pairs'][:5]]
    fav = "data:image/svg+xml," + "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='1' y='1' width='22' height='22' rx='5' fill='%23a2c1f0'/%3E%3Cpath d='M7.4 6.6v6.1a4.6 4.6 0 0 0 9.2 0V6.6' fill='none' stroke='%230c1424' stroke-width='2.3' stroke-linecap='round'/%3E%3C/svg%3E"
    og = (PUBLIC.rstrip('/') + '/' if PUBLIC else '') + 'assets/img/og.jpg'
    html = (html.replace('%CSS%', css).replace('%JS%', js.replace('</script', '<\\/script'))
            .replace('%CATALOG%', json.dumps(cat, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
            .replace('%PRELOAD%', '\n'.join(preload + shoes)).replace('%FAVICON%', fav).replace('%OG_IMAGE%', og))
    open(os.path.join(DIST, 'index.html'), 'w').write(html)
    open(os.path.join(DIST, '.nojekyll'), 'w').write('')
    sz = lambda p: os.path.getsize(p)
    print(f'index.html {sz(os.path.join(DIST, "index.html")) / 1024:.1f} KB (js {len(js) / 1024:.1f} KB, css {len(css) / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
