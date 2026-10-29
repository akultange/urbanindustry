# Urban Industry — the wall

Concept site for [Urban Industry](https://www.instagram.com/urbanindustry_/), a sneaker store in Tbilisi.

**Live:** https://akultange.github.io/urbanindustry/

## What it is

**The box.** The site opens on a closed black shoebox with their wordmark on the lid: *What's in the box?* Hovering it lifts the lid a touch and a line of light escapes. Tapping it (or Enter) opens it: a small press, the lid tips up at the back and lifts away, light comes out of the box, and the Dunk rises out of it while the box falls away. The pair settles exactly where the reel's first frame has it, so the cuts start without a cut. A smaller link opens it without sound. The box is drawn in 3D on the loader's canvas (a fixed camera a little above it), with motion blur on the lid. That tap is also the click browsers need before any audio can play, so on phones and tablets the box shows on every visit. On a computer it shows until it has been opened once; after that the loader starts straight away, with sound if the visitor chose it and the browser lets the page start sound on its own. Where it won't (Chrome counts a reload as a new page that hasn't been clicked yet), the loader runs silent with *Sound on* in its controls, and sound comes back with the visitor's first click.

**The loader.** A fast-cut reel built around one pair, the Nike Dunk Low. Every shot holds for four frames (133 ms) and comes back as its own negative, while the pair stays locked dead centre and the world around it cuts: their blue, the price, the slat wall by day, a technical drawing, their feed, the shelf LED, the colourways, a halftone, a silhouette, the box. It ends on their wall at night and match-cuts onto the real wall, same pair on the same pixels. Then the camera pulls back while the sign and the shelf LEDs come on. Click, tap or Esc skips it. Every visit gets the full reel, links straight to a pair included (the pair opens once the wall is up). The reel plays for everyone, including visitors with reduced motion turned on; for them the camera move at the end becomes a fade.

**The sound.** All of it is synthesised live with Web Audio in `src/sound.js`, no audio files. The box: a press, the lid letting go with a soft suction pop, cardboard and air as it lifts away, tissue paper, then a shimmer that swells into the reel's first beat. Under the reel: a pumping sub drone in F minor, a kick every four cuts (112.5 BPM, so the cuts sit on sixteenth notes), a click and a hat on every cut, a different accent per shot (a register beep on the price, a camera shutter on their feed, a hum on the LED), and a riser into the last cut. On the match cut: a sub drop, the sign's neon hum flickering on, one bell per shelf LED as it lights (F minor pentatonic, in sweep order), and a soft A♭add9 pad as the wall settles. When sound is on, the reel runs on the audio clock so the cuts can't drift off the beat. After that it stays quiet: small sounds for hover, opening a pair, picking a size and ordering. The speaker button in the header turns it on and off, and the choice is remembered.

**The wall.** Their slatted wall as a real-time lit scene, with the store's wordmark as a halo-lit sign: white letter faces with their blue glowing onto the slats behind. Ten pairs stand on glass shelves under one soft, even key light with soft shadows. Hover a pair and it pops up off the glass, floats a little and its shelf LED comes on in the brand blue, with a tag under the shelf: the brand, the model and the price, lit like the sign. Click it and the camera moves in, with the price, sizes in stock, the store's own photos and an order button. The button copies the order text and opens their Instagram Direct (Messenger is the fallback).

On a phone you swipe along the wall one pair at a time, and the product view opens as a bottom sheet. Georgian first, with English. Without WebGL the page falls back to a plain grid.

Prices are estimates and sizes are placeholders until the store's stock list arrives.

## Flash safety

The reel re-cuts every 133 ms, so its order was chosen to stay under WCAG 2.3.1: no region of the screen swings between light and dark more than three times a second. `tools/flash_check.py` checks filmed frames per pixel against that rule (failing area must stay under 25% of any 10° field). A high-contrast pair moving back and forth over the same spot counts too, which is why the pair comes out of the box in one move instead of bouncing. On the last check the box and the cuts stayed under 8%; the camera move onto the wall peaked at 17%.

## How it's built

- One WebGL2 canvas, no framework: `src/scene.js` (scene, camera, input) and `src/shaders.js` (GLSL).
- The wall is procedural: slat profile, grooves, wear, a soft key and fill, LED glow, the sign's halo, a faint cursor light, and soft shadows of shelves, pairs and sign letters, all in the wall shader. Glass shelves and rails are one small mesh.
- The sign is drawn from their wordmark (`src/logo.json`, traced from their logo) into a texture at startup, with its halo blurred on the GPU.
- HDR with MSAA, bloom, ACES tone mapping and film grain. Resolution adapts when a phone can't keep up; software GL gets a lighter path.
- The pairs are background-removed cut-outs, one layer each in a texture array. Low-res layers load first and sharp ones follow.
- The loader is `src/reel.js`, a 2D canvas (the box is drawn there too). Its feed photos and the line drawing live in `assets/reel/`.
- The sound is `src/sound.js`: one audio graph with a compressor and a short generated reverb. The same code renders offline to a WAV for the preview films.
- Fonts are self-hosted and subset: Rubik for Latin (close to their rounded wordmark), Noto Sans Georgian (variable width) for Georgian, and Inter Tight only for arrows.

```
src/        index.html, style.css, app.js, reel.js, sound.js, scene.js, shaders.js, gl.js, catalog.json, logo.json
assets/     shoes/ (cut-outs 512 + 1024), photos/ (their feed), reel/ (loader assets), img/og.jpg
tools/      build.py, shoot.js / shoot2.js / live.js / gate.js / visits.js / hover.js / swipe.js (headless checks),
            reel_video.js (films the box and the loader with its score), score.js (re-renders just the score),
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
npm run build && npm run serve      # http://127.0.0.1:8765/
npm run qa                          # headless screenshots + console check
npm run reel                        # film the box + loader (with sound) to qa/reel and run the flash check
```

URL switches for demos: `?nogate` skips the box, `?noreel` skips the loader, `?short` plays a three-cut version, `?lang=en` or `?lang=ka` picks the language. To see the box again on a computer, use a private window or clear the site's data.
