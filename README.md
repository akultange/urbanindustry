# Urban Industry — the wall

Concept site for [Urban Industry](https://www.instagram.com/urbanindustry_/), a sneaker store in Tbilisi.

**Live:** https://akultange.github.io/urbanindustry/

The store's slatted wall, rebuilt as a real-time lit scene. Ten pairs from their feed stand on glass shelves. A light follows the cursor across the slats. Hover a pair and its shelf lights up in the brand blue. Click it and the camera moves in to the shelf, with the price, sizes in stock, the store's own photos and an order button. The button copies the order text and opens their Instagram Direct (Messenger is the fallback).

On a phone you swipe along the wall one pair at a time, and the product view opens as a bottom sheet. Georgian first, with English. Without WebGL the page falls back to a plain grid.

Prices are estimates and sizes are placeholders until the store's stock list arrives.

## How it's built

- One WebGL2 canvas, no framework: `src/scene.js` (scene, camera, input) and `src/shaders.js` (GLSL).
- The wall is procedural. Slat profile, grooves, wear, spot cones, LED wash, cursor light and soft shadows of each pair cast through its own alpha are all computed in the wall shader. Glass shelves and rails are a single small mesh.
- HDR with MSAA, bloom, ACES tone mapping and film grain. Resolution adapts when a phone can't keep up.
- The pairs are background-removed cut-outs, one layer each in a texture array. Low-res layers load first and sharp ones follow.
- Fonts are self-hosted and subset: Noto Sans Georgian (variable width), Inter Tight, JetBrains Mono, and Rubik for the wordmark.

```
src/        index.html, style.css, app.js, scene.js, shaders.js, gl.js, catalog.json
assets/     shoes/ (cut-outs 512 + 1024), photos/ (their feed), img/og.jpg
tools/      build.py, shoot.js / shoot2.js (headless checks), og.js (share image)
docs/       the built site, served by GitHub Pages
```

## Change a pair, a price or a size

Edit `src/catalog.json`: `price`, `sizes`, `soldOut`, `desc`, `photos`. Then rebuild:

```
npm install
pip install fonttools brotli
npm run build:pages      # writes docs/
```

Commit `docs/` and Pages updates in about a minute. For a new pair, add its cut-out as `assets/shoes/<id>-1024.webp` and `-512.webp` (1024×640, transparent, sole on the bottom edge).

## Run locally

```
npm run build && npm run serve      # http://127.0.0.1:8765/
npm run qa                          # headless screenshots + console check
```
