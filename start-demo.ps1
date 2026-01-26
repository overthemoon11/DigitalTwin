# Smart Building HVAC Digital Twin - Demo Startup Script
# Run this script to start all components of the digital twin demo

param(
    [switch]$SkipInstall,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HVAC Digital Twin - Demo Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js installation
function Test-NodeInstalled {
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "✓ Node.js installed: $nodeVersion" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "✗ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
        return $false
    }
    return $false
}

# Check if backend dependencies are installed
function Test-BackendDeps {
    $nodeModules = Join-Path $RootDir "backend\node_modules"
    return Test-Path $nodeModules
}

# Check if frontend dependencies are installed
function Test-FrontendDeps {
    $nodeModules = Join-Path $RootDir "frontend\node_modules"
    return Test-Path $nodeModules
}

# Install dependencies
function Install-Dependencies {
    Write-Host ""
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    
    # Backend
    Write-Host "  → Installing backend dependencies..." -ForegroundColor Gray
    Set-Location (Join-Path $RootDir "backend")
    npm install 2>&1 | Out-Null
    Write-Host "    ✓ Backend dependencies installed" -ForegroundColor Green
    
    # Frontend
    Write-Host "  → Installing frontend dependencies..." -ForegroundColor Gray
    Set-Location (Join-Path $RootDir "frontend")
    npm install 2>&1 | Out-Null
    Write-Host "    ✓ Frontend dependencies installed" -ForegroundColor Green
    
    Set-Location $RootDir
}

# Reset twin state to baseline
function Reset-TwinState {
    $stateFile = Join-Path $RootDir "twin\twin.state.json"
    $baselineFile = Join-Path $RootDir "twin\twin.baseline.json"
    
    if (Test-Path $baselineFile) {
        Copy-Item $baselineFile $stateFile -Force
        Write-Host "✓ Twin state reset to baseline" -ForegroundColor Green
    }
}

# Start backend server
function Start-Backend {
    Write-Host ""
    Write-Host "Starting Backend Server..." -ForegroundColor Yellow
    $backendDir = Join-Path $RootDir "backend"
    
    $backendJob = Start-Job -ScriptBlock {
        param($dir)
        Set-Location $dir
        npm start 2>&1
    } -ArgumentList $backendDir
    
    # Wait for backend to start
    Start-Sleep -Seconds 2
    
    # Check if backend is running
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/twin" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ Backend running at http://localhost:3001" -ForegroundColor Green
            return $backendJob
        }
    } catch {
        Write-Host "  Backend starting... (may take a moment)" -ForegroundColor Gray
    }
    
    return $backendJob
}

# Start frontend server
function Start-Frontend {
    Write-Host ""
    Write-Host "Starting Frontend Server..." -ForegroundColor Yellow
    $frontendDir = Join-Path $RootDir "frontend"
    
    $frontendJob = Start-Job -ScriptBlock {
        param($dir)
        Set-Location $dir
        npm run dev 2>&1
    } -ArgumentList $frontendDir
    
    Write-Host "✓ Frontend starting at http://localhost:3000" -ForegroundColor Green
    return $frontendJob
}

# Main execution
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-NodeInstalled)) {
    exit 1
}

# Install dependencies if needed
if (-not $SkipInstall) {
    if (-not (Test-BackendDeps) -or -not (Test-FrontendDeps)) {
        Install-Dependencies
    } else {
        Write-Host "✓ Dependencies already installed (use -SkipInstall to skip check)" -ForegroundColor Green
    }
}

# Reset twin state
Reset-TwinState

# Start servers
$jobs = @()

if (-not $FrontendOnly) {
    # Start backend in new terminal
    Write-Host ""
    Write-Host "Starting Backend Server in new terminal..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\backend'; Write-Host 'HVAC Digital Twin - Backend Server' -ForegroundColor Cyan; npm start"
    Start-Sleep -Seconds 3
    Write-Host "✓ Backend server started" -ForegroundColor Green
}

if (-not $BackendOnly) {
    # Start frontend in new terminal
    Write-Host ""
    Write-Host "Starting Frontend Server in new terminal..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\frontend'; Write-Host 'HVAC Digital Twin - Frontend Server' -ForegroundColor Cyan; npm run dev"
    Start-Sleep -Seconds 2
    Write-Host "✓ Frontend server started" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Demo Started Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend API:  http://localhost:3001" -ForegroundColor White
Write-Host "  Frontend UI:  http://localhost:3000" -ForegroundColor White
Write-Host "  WebSocket:    ws://localhost:3001/ws" -ForegroundColor White
Write-Host ""
Write-Host "  Open http://localhost:3000 in your browser" -ForegroundColor Yellow
Write-Host ""
Write-Host "  To stop the demo, close the terminal windows" -ForegroundColor Gray
Write-Host ""

# Open browser after a brief delay
Start-Sleep -Seconds 3
Write-Host "Opening browser..." -ForegroundColor Gray
Start-Process "http://localhost:3000"
