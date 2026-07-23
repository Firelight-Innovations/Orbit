# Set up the Python backend venv for Orbit.
#
# Playwright must connect to Electron's bundled Chromium (126 for Electron 31)
# over CDP, so it is pinned to 1.44.0. On Python 3.13 that version's greenlet
# pin has no wheel, so playwright is installed with --no-deps and the 3.13-safe
# greenlet/pyee from requirements.txt satisfy it at runtime.

$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "..\backend"
Push-Location $backend

try {
    if (-not (Test-Path ".venv")) {
        python -m venv .venv
    }

    $py = ".\.venv\Scripts\python.exe"

    & $py -m pip install --upgrade pip
    & $py -m pip install -r requirements.txt
    # Install the CDP-compatible Playwright without its stale greenlet pin.
    & $py -m pip install "playwright==1.44.0" --no-deps

    Write-Host "Backend venv ready." -ForegroundColor Green
}
finally {
    Pop-Location
}
