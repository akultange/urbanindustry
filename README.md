# Urban Industry — the wall

Concept site for [Urban Industry](https://www.instagram.com/urbanindustry_/), a sneaker store in Tbilisi.

**Live:** https://akultange.github.io/urbanindustry/

## What it is

**The loader.** A fast-cut reel built around one pair, the Nike Dunk Low. Every shot holds for four frames (133 ms) and comes back as its own negative, while the pair stays locked dead centre and the world around it cuts: their blue, the price, the slat wall by day, a technical drawing, their feed, the shelf LED, the colourways, a halftone, a silhouette, the box. It ends on their wall at night and match-cuts onto the real wall, same pair on the same pixels. Then the camera pulls back while the sign and the shelf LEDs come on. Click, tap or any key skips it. A second visit in the same session gets a three-cut version. Reduced-motion users get a still frame; `?reel` on the URL always plays the full reel (handy for demos on machines with animations turned off).

**The wall.** Their slatted wall as a real-time lit scene, with the store's wordmark as a halo-lit sign: white letter faces with their blue glowing onto the slats behind. Ten pairs stand on glass shelves under one soft, even key light with soft shadows. Hover a pair and it pops up off the glass, floats a little and its shelf LED comes on in the brand blue. Click it and the camera moves in, with the price, sizes in stock, the store's own photos and an order button. The button copies the order text and opens their Instagram Direct (Messenger is the fallback).

On a phone you swipe along the wall one pair at a time, and the product view opens as a bottom sheet. Georgian first, with English. Without WebGL the page falls back to a plain grid.

Prices are estimates and sizes are placeholders until the store's stock list arrives.

## Flash safety

The reel re-cuts every 133 ms, so its order was chosen to stay under WCAG 2.3.1: no region of the screen swings between light and dark more than three times a second. `tools/flash_check.py` checks filmed frames per pixel against that rule (failing area must stay under 25% of any 10° field). On the last check the cuts peaked under 1% on desktop and 5% on a phone; the camera move onto the wall that follows peaked at 17%.

## How it's built

- One WebGL2 canvas, no framework: `src/scene.js` (scene, camera, input) and `src/shaders.js` (GLSL).
- The wall is procedural: slat profile, grooves, wear, a soft key and fill, LED glow, the sign's halo, a faint cursor light, and soft shadows of shelves, pairs and sign letters, all in the wall shader. Glass shelves and rails are one small mesh.
- The sign is drawn from their wordmark (`src/logo.json`, traced from their logo) into a texture at startup, with its halo blurred on the GPU.
- HDR with MSAA, bloom, ACES tone mapping and film grain. Resolution adapts when a phone can't keep up; software GL gets a lighter path.
- The pairs are background-removed cut-outs, one layer each in a texture array. Low-res layers load first and sharp ones follow.
- The loader is `src/reel.js`, a 2D canvas. Its feed photos and the line drawing live in `assets/reel/`.
- Fonts are self-hosted and subset: Rubik for Latin (close to their rounded wordmark), Noto Sans Georgian (variable width) for Georgian, and Inter Tight only for arrows.

```
src/        index.html, style.css, app.js, reel.js, scene.js, shaders.js, gl.js, catalog.json, logo.json
assets/     shoes/ (cut-outs 512 + 1024), photos/ (their feed), reel/ (loader assets), img/og.jpg
tools/      build.py, shoot.js / shoot2.js / live.js (headless checks), reel_video.js (films the loader),
            flash_check.py (WCAG 2.3.1), reel_frames.js (every shot, for re-ordering), og.js (share image)
docs/       the built site, served by GitHub Pages
```

## Change a pair, a price or a size

Edit `src/catalog.json`: `price`, `sizes`, `soldOut`, `desc`, `photos`. Then rebuild:

```
npm install
pip install fonttools brotli
npm run build:pages      # writes docs/
```

Commit `docs/` and Pages updates in about a minute. For a new pair, add its cut-out as `assets/shoes/<id>-1024.webp` and `-512.webp` (1024×640, transparent, cropped tight so the sole sits on the bottom edge).

## Run locally

```
npm run build && npm run serve      # http://127.0.0.1:8765/   (?noreel skips the loader)
npm run qa                          # headless screenshots + console check
npm run reel                        # film the loader to qa/reel and run the flash check
```
