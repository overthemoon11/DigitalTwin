@echo off
echo Creating directories for Digital Twin project...
cd /d C:\users\leestott\digitaltwin

mkdir frontend\src\components 2>nul
mkdir frontend\src\hooks 2>nul
mkdir frontend\src\utils 2>nul
mkdir frontend\public 2>nul
mkdir backend\src\routes 2>nul
mkdir backend\src\services 2>nul
mkdir backend\src\simulator 2>nul
mkdir backend\tests 2>nul
mkdir twin 2>nul
mkdir assets 2>nul
mkdir docs 2>nul

echo.
echo All directories created successfully!
echo.
echo Directory listing:
dir /ad /b
echo.
pause
