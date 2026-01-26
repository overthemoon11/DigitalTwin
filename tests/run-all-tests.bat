@echo off
REM Smart Building HVAC Digital Twin - Test Runner
REM Runs all tests for the digital twin application

echo ========================================
echo   HVAC Digital Twin - Test Suite
echo ========================================
echo.

set ROOT_DIR=%~dp0..
set TOTAL=0
set PASSED=0
set FAILED=0

echo === Backend Tests ===
echo.

echo Running: Simulator Unit Tests
node --test "%ROOT_DIR%\backend\tests\simulator.test.js"
if %ERRORLEVEL% EQU 0 (
    echo   PASSED
    set /a PASSED+=1
) else (
    echo   FAILED
    set /a FAILED+=1
)
set /a TOTAL+=1

echo.
echo Running: API Endpoint Tests
node --test "%ROOT_DIR%\tests\backend\api.test.js"
if %ERRORLEVEL% EQU 0 (
    echo   PASSED
    set /a PASSED+=1
) else (
    echo   FAILED
    set /a FAILED+=1
)
set /a TOTAL+=1

echo.
echo === Validation Tests ===
echo.

echo Running: Schema Validation Tests
node --test "%ROOT_DIR%\tests\validation\twin-schema.test.js"
if %ERRORLEVEL% EQU 0 (
    echo   PASSED
    set /a PASSED+=1
) else (
    echo   FAILED
    set /a FAILED+=1
)
set /a TOTAL+=1

echo Running: Health Check Tests
node --test "%ROOT_DIR%\tests\validation\health-check.test.js"
if %ERRORLEVEL% EQU 0 (
    echo   PASSED
    set /a PASSED+=1
) else (
    echo   FAILED
    set /a FAILED+=1
)
set /a TOTAL+=1

echo.
echo ========================================
echo   Test Summary
echo ========================================
echo.
echo   Total Tests:  %TOTAL%
echo   Passed:       %PASSED%
echo   Failed:       %FAILED%
echo.

if %FAILED% GTR 0 (
    echo Some tests failed.
    exit /b 1
) else (
    echo All tests passed!
    exit /b 0
)
