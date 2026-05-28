@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   LiteProducer Installer
echo ============================================
echo.

:: Check for Docker
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

:: Check Docker is running
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo Docker detected and running.
echo.

:: Ask for installation mode
echo Select installation mode:
echo   1) Full (uWSGI + Nginx) - recommended for production
echo   2) Standalone (Flask development server, no uWSGI/Nginx)
echo.
set /p MODE="Enter choice (1 or 2): "

if "%MODE%"=="2" goto standalone
if "%MODE%"=="1" goto full

echo Invalid choice. Defaulting to full installation.
goto full

:full
echo.
echo Installing with uWSGI + Nginx (full production mode)...
echo.

:: Build and start Docker containers
docker compose down >nul 2>nul
docker compose build
if %errorlevel% neq 0 (
    echo [ERROR] Docker build failed.
    pause
    exit /b 1
)

docker compose up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start containers.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Installation complete!
echo   Access LiteProducer at http://localhost
echo   (Nginx reverse proxy on port 80)
echo ============================================
goto end

:standalone
echo.
echo Installing in standalone mode (no uWSGI, no Nginx)...
echo.

:: Build and start standalone Docker container
docker compose -f docker-compose.standalone.yml down >nul 2>nul
docker compose -f docker-compose.standalone.yml build
if %errorlevel% neq 0 (
    echo [ERROR] Docker build failed.
    pause
    exit /b 1
)

docker compose -f docker-compose.standalone.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start container.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Installation complete!
echo   Access LiteProducer at http://localhost:5000
echo   (Flask development server, standalone mode)
echo ============================================
goto end

:end
echo.
pause
