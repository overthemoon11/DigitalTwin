@echo off
REM Smart Building HVAC Digital Twin - Demo Startup Script (Batch)
REM This script starts all components needed for the demo

echo ========================================
echo   HVAC Digital Twin - Demo Launcher
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo Checking Node.js version...
node --version
echo.

REM Get script directory
set ROOT_DIR=%~dp0
cd /d %ROOT_DIR%

REM Install backend dependencies if needed
if not exist "%ROOT_DIR%backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    echo Backend dependencies installed.
) else (
    echo Backend dependencies already installed.
)

REM Install frontend dependencies if needed
if not exist "%ROOT_DIR%frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    echo Frontend dependencies installed.
) else (
    echo Frontend dependencies already installed.
)

echo.
echo Resetting twin state to baseline...
copy /Y "%ROOT_DIR%twin\twin.baseline.json" "%ROOT_DIR%twin\twin.state.json" >nul
echo Twin state reset.

echo.
echo ========================================
echo Starting servers...
echo ========================================

REM Start backend server in new window
echo Starting Backend Server...
start "HVAC Backend" cmd /k "cd /d %ROOT_DIR%backend && npm start"

REM Wait for backend to initialize
timeout /t 3 /nobreak >nul

REM Start frontend server in new window
echo Starting Frontend Server...
start "HVAC Frontend" cmd /k "cd /d %ROOT_DIR%frontend && npm run dev"

REM Wait for frontend to start
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   Demo Started Successfully!
echo ========================================
echo.
echo   Backend API:  http://localhost:3001
echo   Frontend UI:  http://localhost:3000
echo   WebSocket:    ws://localhost:3001/ws
echo.
echo   Opening browser in 3 seconds...
echo.
echo   To stop the demo, close the server windows.
echo.

timeout /t 3 /nobreak >nul

REM Open default browser
start "" "http://localhost:3000"

echo Browser opened. Press any key to close this window...
pause >nul
