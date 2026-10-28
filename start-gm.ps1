# start-gm.ps1
# Windows launcher for the AI Game Master.
# Requires: Ollama running (starts automatically as a Windows service after install)
#           Backend running (start-backend.sh or uvicorn manually)
#
# Override defaults by setting env vars before running, e.g.:
#   $env:AI_GM_MODEL = "qwen2.5:14b-instruct"   # swap to smaller/faster model
#   $env:AI_GM_PLAN_INTERVAL_S = "300"           # replan every 5 min instead of 10

param(
    [string]$Model          = "qwen2.5:14b-instruct",
    [string]$BackendUrl     = "http://localhost:8000",
    [string]$OllamaUrl      = "http://localhost:11434",
    [string]$ApiKey         = "devkey",
    [string]$PlanInterval   = "600",
    [string]$PollInterval   = "5"
)

$Root   = $PSScriptRoot
$GmDir  = Join-Path $Root "ai_gm"
$Venv   = Join-Path $GmDir ".venv-win"
$Python = Join-Path $Venv "Scripts\python.exe"

# ── Create/update venv ────────────────────────────────────────────────────────
if (-not (Test-Path $Python)) {
    Write-Host "[gm] Creating virtual environment..." -ForegroundColor Cyan
    python -m venv $Venv
    & $Python -m pip install -q -r (Join-Path $GmDir "requirements.txt")
    Write-Host "[gm] Environment ready." -ForegroundColor Green
}

# ── Verify Ollama is reachable ────────────────────────────────────────────────
try {
    $null = Invoke-WebRequest -Uri "$OllamaUrl/api/tags" -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Error "Ollama is not running at $OllamaUrl.`nStart it with: ollama serve"
    exit 1
}

# ── Verify the model is available ─────────────────────────────────────────────
$tags = (Invoke-WebRequest -Uri "$OllamaUrl/api/tags" -UseBasicParsing).Content | ConvertFrom-Json
$modelNames = $tags.models | ForEach-Object { $_.name }
if ($Model -notin $modelNames) {
    Write-Warning "Model '$Model' not found locally. Pulling now (this may take a while)..."
    ollama pull $Model
}

# ── Launch GM ─────────────────────────────────────────────────────────────────
Write-Host "[gm] Starting AI Game Master — model: $Model" -ForegroundColor Cyan
Write-Host "[gm] Backend: $BackendUrl   Ollama: $OllamaUrl" -ForegroundColor DarkGray

$env:AI_API_KEY            = $ApiKey
$env:AI_GM_MODEL           = $Model
$env:AI_GM_BACKEND_URL     = $BackendUrl
$env:OLLAMA_URL            = $OllamaUrl
$env:AI_GM_PLAN_INTERVAL_S = $PlanInterval
$env:AI_GM_POLL_INTERVAL_S = $PollInterval

Set-Location $Root
& $Python -m ai_gm.gm
