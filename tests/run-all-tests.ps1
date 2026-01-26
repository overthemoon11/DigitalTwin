# Smart Building HVAC Digital Twin - Test Runner
# Runs all tests for the digital twin application

param(
    [switch]$BackendOnly,
    [switch]$IntegrationOnly,
    [switch]$ValidationOnly,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$RootDir = Split-Path $PSScriptRoot -Parent

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HVAC Digital Twin - Test Suite" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalTests = 0
$passedTests = 0
$failedTests = 0

function Run-TestFile {
    param([string]$TestPath, [string]$TestName)
    
    if (Test-Path $TestPath) {
        Write-Host "Running: $TestName" -ForegroundColor Yellow
        $result = node --test $TestPath 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ PASSED" -ForegroundColor Green
            $script:passedTests++
        } else {
            Write-Host "  ✗ FAILED" -ForegroundColor Red
            if ($Verbose) {
                Write-Host $result -ForegroundColor Gray
            }
            $script:failedTests++
        }
        $script:totalTests++
    } else {
        Write-Host "  ⚠ Test file not found: $TestPath" -ForegroundColor Yellow
    }
}

# Backend Tests
if (-not $IntegrationOnly -and -not $ValidationOnly) {
    Write-Host ""
    Write-Host "=== Backend Tests ===" -ForegroundColor Magenta
    
    Run-TestFile (Join-Path $RootDir "backend\tests\simulator.test.js") "Simulator Unit Tests"
    Run-TestFile (Join-Path $RootDir "tests\backend\api.test.js") "API Endpoint Tests"
    Run-TestFile (Join-Path $RootDir "tests\backend\websocket.test.js") "WebSocket Tests"
}

# Integration Tests
if (-not $BackendOnly -and -not $ValidationOnly) {
    Write-Host ""
    Write-Host "=== Integration Tests ===" -ForegroundColor Magenta
    
    Run-TestFile (Join-Path $RootDir "tests\integration\e2e.test.js") "End-to-End Tests"
    Run-TestFile (Join-Path $RootDir "tests\integration\data-flow.test.js") "Data Flow Tests"
}

# Validation Tests
if (-not $BackendOnly -and -not $IntegrationOnly) {
    Write-Host ""
    Write-Host "=== Validation Tests ===" -ForegroundColor Magenta
    
    Run-TestFile (Join-Path $RootDir "tests\validation\twin-schema.test.js") "Schema Validation Tests"
    Run-TestFile (Join-Path $RootDir "tests\validation\health-check.test.js") "Health Check Tests"
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total Tests:  $totalTests" -ForegroundColor White
Write-Host "  Passed:       $passedTests" -ForegroundColor Green
Write-Host "  Failed:       $failedTests" -ForegroundColor $(if ($failedTests -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($failedTests -gt 0) {
    Write-Host "Some tests failed. Use -Verbose for details." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "All tests passed!" -ForegroundColor Green
    exit 0
}
