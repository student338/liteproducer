@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   LiteProducer Installer
echo ============================================
echo.

:: Ask for installation mode
echo Select installation mode:
echo   1) Full Docker (uWSGI + Nginx) - recommended for production
echo   2) Docker Standalone (Flask dev server, no uWSGI/Nginx)
echo   3) Dockerless (local Python, no Docker required)
echo.
set /p MODE="Enter choice (1, 2, or 3): "

if "%MODE%"=="3" goto dockerless
if "%MODE%"=="2" goto standalone
if "%MODE%"=="1" goto full

echo Invalid choice. Defaulting to full installation.
goto full

:full
echo.
echo Installing with uWSGI + Nginx (full production mode)...
echo.

:: Check for Docker
call :check_docker
if %errorlevel% neq 0 exit /b 1

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

:: Check for Docker
call :check_docker
if %errorlevel% neq 0 exit /b 1

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
exit /b 0

:dockerless
echo.
echo Installing in dockerless mode (local Python, no Docker)...
echo.

:: Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Create virtual environment
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate virtual environment and install dependencies
echo Installing dependencies...
call venv\Scripts\activate.bat
pip install flask fpdf2 requests pypdf
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

:: Create books directory if it doesn't exist
if not exist "books" mkdir books

echo.
echo ============================================
echo   Installation complete!
echo   To start LiteProducer, run:
echo     venv\Scripts\activate.bat
echo     python app.py
echo   Then access at http://localhost:5000
echo ============================================
goto end

:check_docker
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop and try again.
    pause
    exit /b 1
)
echo Docker detected and running.
exit /b 0
