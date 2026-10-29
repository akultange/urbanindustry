# Film the intro on your own graphics card

Films the box, the loader and the wall from the live site, frame by frame, in your own Chrome (or Edge) on the GPU: 4K desktop and a phone version, 60 fps, with the site's own score.

```
powershell -ExecutionPolicy Bypass -File .\render.ps1
```

Needs Node.js. The first run installs two packages (the browser driver and ffmpeg). A Chrome window opens while it films; it can stay behind other windows. The videos land in `out\`.

Other options: `.\render.ps1 <url> <outdir> desk|phone|both <fps> <desktop scale>`, for example `.\render.ps1 https://akultange.github.io/urbanindustry/ out desk 60 1` for 1080p only.
