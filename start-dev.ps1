# start-dev.ps1  — Quick-start script for local development testing
# Opens backend and frontend in separate terminals.
# Prerequisites: Python 3.11+, Node 20+
#   pip install -r backend\requirements.txt  (once)
#   npm install  (once, inside frontend\)

param(
    [int]$BackendPort = 8050
)

$Root = $PSScriptRoot

# ── Kill any stale process on the backend port ────────────────────────────────
$stale = netstat -ano | Select-String ":$BackendPort\s.*LISTENING" | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Select-Object -First 1
if ($stale) {
    Write-Host "[dev] Clearing port $BackendPort (PID $stale)..." -ForegroundColor Yellow
    Stop-Process -Id $stale -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400
}

# ── Backend ───────────────────────────────────────────────────────────────────
Write-Host "[dev] Starting backend on port $BackendPort..." -ForegroundColor Cyan
$backend = Start-Process -PassThru `
    -FilePath "powershell" `
    -ArgumentList "-NoExit", "-Command", `
        "Set-Location '$Root\backend'; python -m uvicorn main:app --reload --host 127.0.0.1 --port $BackendPort"

# ── Frontend ──────────────────────────────────────────────────────────────────
Write-Host "[dev] Starting frontend dev server on port 5173..." -ForegroundColor Cyan
Start-Process `
    -FilePath "powershell" `
    -ArgumentList "-NoExit", "-Command", `
        "Set-Location '$Root\frontend'; npm run dev"

Start-Sleep -Seconds 3

# ── Open browser ──────────────────────────────────────────────────────────────
Write-Host "[dev] Opening http://localhost:5173 ..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "Backend:  http://localhost:$BackendPort" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:5173"         -ForegroundColor Yellow
Write-Host ""
Write-Host "WORKFLOW:" -ForegroundColor Cyan
Write-Host "  1. Click NEW GAME on the landing screen"
Write-Host "  2. Choose crew size and generate galaxy"
Write-Host "  3. Go to Station Setup, configure stations, copy codes"
Write-Host "  4. Open extra browser tabs/windows and navigate to each code URL"
Write-Host "  5. Each tab = one station tablet"
Write-Host ""
Write-Host "Press Ctrl+C or close this window to stop." -ForegroundColor DarkGray
Wait-Process -Id $backend.Id
