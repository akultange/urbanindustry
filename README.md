# Urban Industry — the wall

Concept site for [Urban Industry](https://www.instagram.com/urbanindustry_/), a sneaker store in Tbilisi.

**Live:** https://akultange.github.io/urbanindustry/

## What it is

**The box.** Every visit opens on a closed black shoebox with their wordmark on the lid: *What's in the box?* Hovering it lifts the lid a touch and a line of light escapes. Tapping it (or Enter) opens it: a small press, the lid tips up at the back and lifts away, light comes out of the box, and the Dunk rises out of it while the box falls away. The pair settles exactly where the reel's first frame has it, so the cuts start without a cut. A smaller link opens it without sound. The box is drawn in 3D on the loader's canvas (a fixed camera a little above it), with motion blur on the lid. It shows every time because browsers only let a page start sound after a click on that page, and Chrome counts a reload as a new page: opening the box is that click. The one exception is a computer whose browser lets the page start sound by itself, for a visitor who chose sound before: then the loader goes straight in, with sound.

**The loader.** A fast-cut reel built around one pair, the Nike Dunk Low. Every shot holds for four frames (133 ms) and comes back as its own negative, while the pair stays locked dead centre and the world around it cuts: their blue, the price, the slat wall by day, a technical drawing, their feed, the shelf LED, the colourways, a halftone, a silhouette, the box. It ends on their wall at night and match-cuts onto the real wall, same pair on the same pixels. The loader dissolves into the real wall while the camera pulls back, at an even zoom rate (the distance changes geometrically), with a macro-lens rack focus at the start and motion blur along the zoom. The shop is dim and the shelf LEDs run along the wall. The sign stays dark until the camera has nearly arrived, then comes on like a tired neon tube: two short blinks, then on, with a little flutter as it settles, and the room lights come up with it. That's the end of the intro: the header and footer come in after it. Click, tap or Esc skips the loader. Every visit gets the full reel, links straight to a pair included (the pair opens once the wall is up). The reel plays for everyone, including visitors with reduced motion turned on; for them the camera move at the end becomes a fade.

**The sound.** All of it is synthesised live with Web Audio in `src/sound.js`, no audio files. The box: a press, the lid letting go with a soft suction pop, cardboard and air as it lifts away, tissue paper, then a shimmer that swells into the reel's first beat. Under the reel: a pumping sub drone in F minor, a kick every four cuts (112.5 BPM, so the cuts sit on sixteenth notes), a click and a hat on every cut, a different accent per shot (a register beep on the price, a camera shutter on their feed, a hum on the LED), and a riser into the last cut. On the hand-off to the wall: a sub drop, one bell per shelf LED as it lights (F minor pentatonic, in sweep order), and a soft A♭add9 pad that opens up when the sign comes on. The sign's blinks each get an electrical tick and a burst of buzz, then a relay clunk and the hum settles. When sound is on, the reel runs on the audio clock so the cuts can't drift off the beat. After that it stays quiet: small sounds for hover, opening a pair, picking a size and ordering. The speaker button in the header turns it on and off, and the choice is remembered.

**The wall.** Their slatted wall as a real-time lit scene, with the store's wordmark as a halo-lit sign: white letter faces with their blue glowing onto the slats behind. Ten pairs stand on glass shelves under one soft, even key light with soft shadows. Hover a pair and it pops up off the glass, floats a little and its shelf LED comes on in the brand blue, with a tag under the shelf: the brand, the model and the price, lit like the sign. Click it and the camera moves in, with the price, sizes in stock, the store's own photos and an order button. The button copies the order text and opens their Instagram Direct (Messenger is the fallback).

On a phone it's the same wall in two columns, all ten pairs on screen under the sign. Tap a pair: its shelf lights, it comes off the shelf into the space above a bottom sheet with the price, sizes and order button. Tap the wall to put it back. Turning a tablet between upright and wide re-arranges the columns. Georgian first, with English. Without WebGL the page falls back to a plain grid.

Prices are estimates and sizes are placeholders until the store's stock list arrives.

## Flash safety

The reel re-cuts every 133 ms, so its order was chosen to stay under WCAG 2.3.1: no region of the screen swings between light and dark more than three times a second. `tools/flash_check.py` checks filmed frames per pixel against that rule (failing area must stay under 25% of any 10° field). A high-contrast pair moving back and forth over the same spot counts too, which is why the pair comes out of the box in one move instead of bouncing, and why the pull-back onto the wall is motion-blurred with the room dimmed: the slat grooves sliding past would otherwise strobe. The sign's broken-neon start is two blinks before it holds, five changes in half a second, under the three-flash limit. On the last check (the 60 fps films) a computer peaked at 14% during the box opening, with the cuts at 4% and the hand-off at 11%; a phone peaked at 18% during the hand-off, where the slats fill more of the screen.

## How it's built

- One WebGL2 canvas, no framework: `src/scene.js` (scene, camera, input) and `src/shaders.js` (GLSL).
- The wall is procedural: slat profile, grooves, wear, a soft key and fill, LED glow, the sign's halo, a faint cursor light, and soft shadows of shelves, pairs and sign letters, all in the wall shader. Glass shelves and rails are one small mesh.
- The sign is drawn from their wordmark (`src/logo.json`, traced from their logo) into a texture at startup, with its halo blurred on the GPU. Safari ships the canvas blur switched off (setting it reads back fine but draws sharp), so the page blurs a test dot first and does the halo in script where it doesn't spread.
- HDR with MSAA, bloom, ACES tone mapping and film grain. Phones draw at the screen's own resolution (3x on an iPhone) with the sharp pair layers; resolution drops by itself when a phone can't keep up. Software GL gets a lighter path (except when filming, which keeps full quality).
- Safari 26 colours its status bar and bottom toolbar from a full-width fixed element with a solid background at each edge (it no longer reads `theme-color`). Two invisible strips (`.tint`) hand it the wall's colour at each edge, so the bars carry on from the page; panels sit out of the page while shut (`[hidden]`) so their dark backgrounds don't get picked up, and an open panel colours the bars itself. Chrome on Android follows `theme-color`, kept in step.
- The hand-off from the loader racks focus: for its first second the wall around the pair is softened (the scene blurred down a 1/2, 1/4, 1/8 chain and mixed in outside the pair), so the loader's lone pair on a dark wall dissolves into the real wall without the neighbours jumping in sharp.
- The pairs are background-removed cut-outs, one layer each in a texture array. Low-res layers load first and sharp ones follow.
- The loader is `src/reel.js`, a 2D canvas (the box is drawn there too). Its feed photos and the line drawing live in `assets/reel/`.
- The sound is `src/sound.js`: one audio graph with a compressor and a short generated reverb. The same code renders offline to a WAV for the preview films.
- Fonts are self-hosted and subset: Rubik for Latin (close to their rounded wordmark), Noto Sans Georgian (variable width) for Georgian, and Inter Tight only for arrows.

```
src/        index.html, style.css, app.js, reel.js, sound.js, scene.js, shaders.js, gl.js, catalog.json, logo.json,
            admin/ (index.html, admin.css, admin.js, cutout.js, github.js, store.js)
assets/     shoes/ (cut-outs 512 + 1024), photos/ (their feed), reel/ (loader assets), img/og.jpg
vendor/     u2netp.onnx (the admin's cut-out model)
tools/      build.py, shoot.js / shoot2.js / live.js / gate.js / visits.js / hover.js / swipe.js (headless checks),
            reel_video.js (films the box and the loader with its score, 1080p 60 fps), score.js (re-renders just the score),
            win/ (the same film on your own graphics card in Chrome: 4K, one PowerShell command),
            flash_check.py (WCAG 2.3.1), reel_frames.js (every shot, for re-ordering), og.js (share image)
docs/       the built site, served by GitHub Pages
```

## The shop's admin (`/admin`)

`https://akultange.github.io/urbanindustry/admin/` is where the shop runs the wall themselves, in Georgian or English, on a phone or a computer:

- **Add a pair from a photo.** One shoe from the side works best. The background comes off in the browser: U²-Net (the small model, `vendor/u2netp.onnx`, Apache-2.0) finds the pair, run with onnxruntime-web (WASM, MIT), then the edge is pulled onto the photo's own edges (a guided filter), gaps inside the outline are filled so white leather on a white backdrop stays, a soft shadow goes with the backdrop, and the backdrop's colour is taken out of the edge so there's no fringe on the dark wall (`src/admin/cutout.js`). The tool is about 16 MB, fetched the first time and cached. A photo that's already cut out is used as it is. The result is laid out like the original ten (1024×640 and 512×320 layers, `rect`, `base`).
- **Price, colour, description, sizes in stock and sold out, feed photos.** Tap a size to cycle: not carried, in stock, sold out.
- **The wall:** ten shelves, in order, with arrows to move a pair. Pairs can wait off the wall. The Dunk is the intro's pair (the loader's film is made around it), so it stays up.
- **See it on the wall** opens the real site with the draft (`?draft`, this browser only, with a "not published yet" badge).
- **Publish** is one commit to this repository through the GitHub API (`src/admin/github.js`): `docs/catalog.json`, `src/catalog.json` and the new pictures in `docs/assets/` and `assets/`. Pages deploys it in about a minute; the admin says when it's live. The page reads `catalog.json` fresh on every visit (the copy built into `index.html` is only a fallback), so nothing needs rebuilding. If someone else published in between, it stops and says so instead of overwriting.

Without signing in it's a demo: everything works and previews, but stays in that browser. To publish, sign in once with a fine-grained GitHub token for this repository with **Contents: Read and write** (the admin walks through it); the key stays in that browser. No server, no database, nothing to pay for.

## Change a pair by hand

Edit `src/catalog.json`: `price`, `sizes`, `soldOut`, `desc`, `photos` (the admin writes the same file). Then rebuild:

```
npm install
pip install fonttools brotli
npm run build:pages      # writes docs/
```

Commit `docs/` and Pages updates in about a minute. For a new pair, add its cut-out as `assets/shoes/<id>-1024.webp` and `-512.webp` (1024×640, transparent, cropped tight so the sole sits on the bottom edge).

## Run locally

```
npm run build && npm run serve      # http://127.0.0.1:8765/
npm run qa                          # headless screenshots + console check
npm run reel                        # film the box + loader (with sound) to qa/reel and run the flash check
```

URL switches for demos: `?nogate` skips the box, `?noreel` skips the loader, `?short` plays a three-cut version, `?lang=en` or `?lang=ka` picks the language. To see the box again on a computer, use a private window or clear the site's data.
