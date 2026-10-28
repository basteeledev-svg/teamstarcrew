# start-local.ps1
# Runs the full game stack on a single Windows PC with multiple touchscreens.
#
# SETUP:
#   1. Install Python 3.11+ and Node 20+
#   2. Run once:  cd backend ; pip install -r requirements.txt
#   3. Run once:  cd frontend ; npm install ; npm run build
#   4. Edit the $stations array below to name each screen's role
#   5. Edit $monitorWidth / $monitorHeight to match your monitors
#   6. Run: powershell -ExecutionPolicy Bypass -File start-local.ps1
#
# WORKFLOW:
#   - Monitor 0 opens the Admin page.  Start a new game there, then go to
#     Station Setup and assign these exact codes to your stations.
#   - Monitors 1-9 are already sitting on their code URLs, waiting.
#     The moment you assign a code in Setup, that screen shows its panels.

param(
    [int]$Port          = 8000,
    [int]$MonitorWidth  = 1920,
    [int]$MonitorHeight = 1080
)

$Root        = $PSScriptRoot
$BackendDir  = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$BaseUrl     = "http://localhost:$Port"

# ── Pre-assigned station codes (must match what you enter in Station Setup) ──
# Add or remove entries to match the number of physical screens you have.
# Change the labels — they are just for your reference in this script.
$stations = @(
    @{ label = "ADMIN / GM";          url = "$BaseUrl/admin"   },
    @{ label = "CAPTAIN";             url = "$BaseUrl/1001"    },
    @{ label = "PILOT";               url = "$BaseUrl/1002"    },
    @{ label = "WEAPONS OFFICER";     url = "$BaseUrl/1003"    },
    @{ label = "SHIELDS OFFICER";     url = "$BaseUrl/1004"    },
    @{ label = "ENGINEER";            url = "$BaseUrl/1005"    },
    @{ label = "BOSUN";               url = "$BaseUrl/1006"    },
    @{ label = "SCIENCE OFFICER";     url = "$BaseUrl/1007"    },
    @{ label = "TACTICAL";            url = "$BaseUrl/1008"    },
    @{ label = "OBSERVER";            url = "$BaseUrl/observer" }
)

# ── Build frontend if dist is missing ────────────────────────────────────────
$distIndex = Join-Path $FrontendDir "dist\index.html"
if (-not (Test-Path $distIndex)) {
    Write-Host "[setup] Building frontend..." -ForegroundColor Cyan
    Push-Location $FrontendDir
    npm run build
    Pop-Location
    if (-not (Test-Path $distIndex)) {
        Write-Error "Frontend build failed. Check npm output above."
        exit 1
    }
    Write-Host "[setup] Frontend built." -ForegroundColor Green
}

# ── Start backend ─────────────────────────────────────────────────────────────
Write-Host "[server] Starting backend on port $Port..." -ForegroundColor Cyan
$backend = Start-Process -PassThru -WindowStyle Minimized `
    -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "$Port" `
    -WorkingDirectory $BackendDir

# Wait until the server responds
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if (-not $ready) { Write-Error "Backend did not start in time."; $backend.Kill(); exit 1 }
Write-Host "[server] Backend ready (PID $($backend.Id))." -ForegroundColor Green

# ── Find Chrome ───────────────────────────────────────────────────────────────
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
    Write-Warning "Chrome not found. Falling back to default browser (touch and kiosk flags may not work)."
    $chrome = $null
}

# ── Open one browser window per screen ───────────────────────────────────────
# Monitors are assumed to be arranged left-to-right starting at X=0.
# If your arrangement differs, change the $x calculation below.
for ($i = 0; $i -lt $stations.Count; $i++) {
    $st  = $stations[$i]
    $x   = $i * $MonitorWidth
    $y   = 0

    Write-Host "[screen $i] $($st.label)  →  $($st.url)  @(${x},${y})" -ForegroundColor Yellow

    $args = @(
        "--new-window",
        "--app=$($st.url)",           # app mode hides address bar and tab strip
        "--window-position=$x,$y",
        "--window-size=$MonitorWidth,$MonitorHeight",
        "--touch-events=enabled",     # required for touch input on Windows
        "--no-first-run",
        "--disable-infobars"
    )

    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList $args
    } else {
        Start-Process $st.url
    }
    Start-Sleep -Milliseconds 400    # stagger launches so Chrome doesn't fight over profiles
}

Write-Host ""
Write-Host "All $($stations.Count) screens launched." -ForegroundColor Green
Write-Host "Open the ADMIN screen, start a new game, then go to Station Setup." -ForegroundColor Cyan
Write-Host "Use codes 1001-1008 when assigning stations — those screens are already waiting." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C or close this window to stop the server." -ForegroundColor DarkGray

# Keep the script alive so Ctrl+C kills the backend cleanly
try {
    $backend.WaitForExit()
} finally {
    Write-Host "[server] Stopping..." -ForegroundColor DarkGray
    if (-not $backend.HasExited) { $backend.Kill() }
}
