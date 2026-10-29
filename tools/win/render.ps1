# Films the Urban Industry intro on this PC's graphics card: 4K desktop + phone, 60 fps, with sound, into .\out
# Run:  powershell -ExecutionPolicy Bypass -File .\render.ps1
# Options pass through to film.js: [url] [outdir] [desk|phone|both] [fps] [desktop scale]
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is needed (https://nodejs.org), then run this again.' }
if (-not (Test-Path node_modules)) { npm install --no-fund --no-audit }
node film.js @args
if ($LASTEXITCODE -eq 0) { Invoke-Item (Join-Path $PSScriptRoot 'out') }
