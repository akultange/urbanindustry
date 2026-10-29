# Film the intro on your own graphics card

Films the box, the loader and the wall from the live site, frame by frame, in your own Chrome (or Edge if there's no Chrome) on the GPU: 4K desktop and a phone version, 60 fps, with the site's own score.

```
powershell -ExecutionPolicy Bypass -File .\render.ps1
```

Needs Node.js 22.12 or newer. The first run installs two packages (the browser driver and ffmpeg). A browser window opens while it films: leave it open. Other windows can cover it, but don't minimize it, or it stops drawing. The console counts the frames as it goes, and the videos land in `out\`, which opens when it's done.

Other options: `.\render.ps1 <url> <outdir> desk|phone|both <fps> <desktop scale>`, for example `.\render.ps1 https://akultange.github.io/urbanindustry/ out desk 60 1` for 1080p only. To use a particular browser, set `CHROME_PATH` to its .exe first.
