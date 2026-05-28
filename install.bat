@echo off
setlocal enabledelayedexpansion

:: Default configuration values
set "PORT=80"
set "STANDALONE_PORT=5000"
set "DOCKERLESS_PORT=5000"
set "BOOKS_DIR=books"
set "FLASK_DEBUG=0"
set "AUTO_START=N"

echo ============================================
echo   LiteProducer Installer
echo ============================================
echo.

:: Ask for installation mode
echo Select installation mode:
echo   1) Full Docker (uWSGI + Nginx) - recommended for production
echo   2) Docker Standalone (Flask dev server, no uWSGI/Nginx)
echo   3) Dockerless (local Python, no Docker required)
echo   4) PWA Installers (Desktop/Mobile apps via Tauri)
echo   5) Uninstall / Cleanup
echo.
set /p MODE="Enter choice (1, 2, 3, 4, or 5): "

if "%MODE%"=="5" goto uninstall
if "%MODE%"=="4" goto config_pwa
if "%MODE%"=="3" goto config_dockerless
if "%MODE%"=="2" goto config_standalone
if "%MODE%"=="1" goto config_full

echo Invalid choice. Please try again.
pause
exit /b 1

:: ============================================
:: Configuration prompts for each mode
:: ============================================

:config_full
echo.
echo --- Configuration (Full Docker) ---
echo.
set /p PORT="Port for Nginx [default: 80]: "
if "!PORT!"=="" set "PORT=80"
set /p BOOKS_DIR="Books directory [default: books]: "
if "!BOOKS_DIR!"=="" set "BOOKS_DIR=books"
set /p AUTO_START="Auto-start containers after build? (Y/N) [default: N]: "
if "!AUTO_START!"=="" set "AUTO_START=N"
goto confirm_full

:config_standalone
echo.
echo --- Configuration (Standalone Docker) ---
echo.
set /p STANDALONE_PORT="Port for Flask server [default: 5000]: "
if "!STANDALONE_PORT!"=="" set "STANDALONE_PORT=5000"
set /p BOOKS_DIR="Books directory [default: books]: "
if "!BOOKS_DIR!"=="" set "BOOKS_DIR=books"
set /p FLASK_DEBUG="Enable Flask debug mode? (1=yes, 0=no) [default: 0]: "
if "!FLASK_DEBUG!"=="" set "FLASK_DEBUG=0"
set /p AUTO_START="Auto-start container after build? (Y/N) [default: N]: "
if "!AUTO_START!"=="" set "AUTO_START=N"
goto confirm_standalone

:config_dockerless
echo.
echo --- Configuration (Dockerless) ---
echo.
set /p DOCKERLESS_PORT="Port for Flask server [default: 5000]: "
if "!DOCKERLESS_PORT!"=="" set "DOCKERLESS_PORT=5000"
set /p BOOKS_DIR="Books directory [default: books]: "
if "!BOOKS_DIR!"=="" set "BOOKS_DIR=books"
set /p FLASK_DEBUG="Enable Flask debug mode? (1=yes, 0=no) [default: 0]: "
if "!FLASK_DEBUG!"=="" set "FLASK_DEBUG=0"
set /p AUTO_START="Auto-start the server after install? (Y/N) [default: N]: "
if "!AUTO_START!"=="" set "AUTO_START=N"
goto confirm_dockerless

:config_pwa
echo.
echo --- Configuration (PWA Installers) ---
echo.
echo Select build target:
echo   1) Windows (.exe / .msi)
echo   2) Android (.apk)
echo   3) iOS (.ipa)
echo   4) Web PWA (static dist/ folder)
echo.
set /p PWA_TARGET="Enter choice (1, 2, 3, or 4): "
if "!PWA_TARGET!"=="" set "PWA_TARGET=1"
goto confirm_pwa

:: ============================================
:: Confirmation screens
:: ============================================

:confirm_full
echo.
echo ============================================
echo   Installation Summary
echo ============================================
echo   Mode:           Full Docker (uWSGI + Nginx)
echo   Nginx Port:     %PORT%
echo   Books Dir:      %BOOKS_DIR%
echo   Auto-start:     %AUTO_START%
echo ============================================
echo.
set /p CONFIRM="Proceed with installation? (Y/N): "
if /i "!CONFIRM!" neq "Y" (
    echo Installation cancelled.
    pause
    exit /b 0
)
goto full

:confirm_standalone
echo.
echo ============================================
echo   Installation Summary
echo ============================================
echo   Mode:           Docker Standalone
echo   Flask Port:     %STANDALONE_PORT%
echo   Books Dir:      %BOOKS_DIR%
echo   Debug Mode:     %FLASK_DEBUG%
echo   Auto-start:     %AUTO_START%
echo ============================================
echo.
set /p CONFIRM="Proceed with installation? (Y/N): "
if /i "!CONFIRM!" neq "Y" (
    echo Installation cancelled.
    pause
    exit /b 0
)
goto standalone

:confirm_dockerless
echo.
echo ============================================
echo   Installation Summary
echo ============================================
echo   Mode:           Dockerless (local Python)
echo   Flask Port:     %DOCKERLESS_PORT%
echo   Books Dir:      %BOOKS_DIR%
echo   Debug Mode:     %FLASK_DEBUG%
echo   Auto-start:     %AUTO_START%
echo ============================================
echo.
set /p CONFIRM="Proceed with installation? (Y/N): "
if /i "!CONFIRM!" neq "Y" (
    echo Installation cancelled.
    pause
    exit /b 0
)
goto dockerless

:confirm_pwa
echo.
echo ============================================
echo   Installation Summary
echo ============================================
echo   Mode:           PWA Installers (Tauri)
if "!PWA_TARGET!"=="1" echo   Target:         Windows (.exe / .msi)
if "!PWA_TARGET!"=="2" echo   Target:         Android (.apk)
if "!PWA_TARGET!"=="3" echo   Target:         iOS (.ipa)
if "!PWA_TARGET!"=="4" echo   Target:         Web PWA (dist/)
echo ============================================
echo.
set /p CONFIRM="Proceed with build? (Y/N): "
if /i "!CONFIRM!" neq "Y" (
    echo Build cancelled.
    pause
    exit /b 0
)
goto pwa

:: ============================================
:: Installation steps
:: ============================================

:full
echo.
echo [1/3] Checking prerequisites...
echo.

:: Check for Docker
call :check_docker
if %errorlevel% neq 0 exit /b 1

:: Create books directory if it doesn't exist
if not exist "!BOOKS_DIR!" mkdir "!BOOKS_DIR!"

echo.
echo [2/3] Building Docker containers...
echo.

:: Generate docker-compose override for custom port and books dir
(
    echo services:
    echo   nginx:
    echo     ports:
    echo       - "!PORT!:80"
    echo     volumes:
    echo       - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    echo       - ./static:/app/static:ro
    echo       - ./!BOOKS_DIR!:/app/books:ro
    echo   web:
    echo     volumes:
    echo       - ./!BOOKS_DIR!:/app/books
) > docker-compose.override.yml

:: Build and start Docker containers
docker compose down >nul 2>nul
docker compose build
if %errorlevel% neq 0 (
    echo [ERROR] Docker build failed.
    del docker-compose.override.yml >nul 2>nul
    pause
    exit /b 1
)

echo.
echo [3/3] Starting containers...
echo.

if /i "!AUTO_START!"=="Y" (
    docker compose up -d
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to start containers.
        del docker-compose.override.yml >nul 2>nul
        pause
        exit /b 1
    )
    echo Containers started successfully.
) else (
    echo Containers built but not started.
    echo To start later, run: docker compose up -d
)

echo.
echo ============================================
echo   Installation complete!
echo   Access LiteProducer at http://localhost:!PORT!
echo   (Nginx reverse proxy on port !PORT!)
echo ============================================
goto end

:standalone
echo.
echo [1/3] Checking prerequisites...
echo.

:: Check for Docker
call :check_docker
if %errorlevel% neq 0 exit /b 1

:: Create books directory if it doesn't exist
if not exist "!BOOKS_DIR!" mkdir "!BOOKS_DIR!"

echo.
echo [2/3] Building Docker container...
echo.

:: Generate standalone override for custom port, books dir, and debug mode
(
    echo services:
    echo   web:
    echo     ports:
    echo       - "!STANDALONE_PORT!:5000"
    echo     volumes:
    echo       - ./!BOOKS_DIR!:/app/books
    echo     environment:
    echo       - FLASK_DEBUG=!FLASK_DEBUG!
) > docker-compose.standalone.override.yml

:: Build and start standalone Docker container
docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.override.yml down >nul 2>nul
docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.override.yml build
if %errorlevel% neq 0 (
    echo [ERROR] Docker build failed.
    del docker-compose.standalone.override.yml >nul 2>nul
    pause
    exit /b 1
)

echo.
echo [3/3] Starting container...
echo.

if /i "!AUTO_START!"=="Y" (
    docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.override.yml up -d
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to start container.
        del docker-compose.standalone.override.yml >nul 2>nul
        pause
        exit /b 1
    )
    echo Container started successfully.
) else (
    echo Container built but not started.
    echo To start later, run: docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.override.yml up -d
)

echo.
echo ============================================
echo   Installation complete!
echo   Access LiteProducer at http://localhost:!STANDALONE_PORT!
echo   (Flask development server, standalone mode)
echo ============================================
goto end

:dockerless
echo.
echo [1/3] Checking prerequisites...
echo.

:: Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Display Python version
echo Python found:
python --version

:: Create books directory if it doesn't exist
if not exist "!BOOKS_DIR!" mkdir "!BOOKS_DIR!"

echo.
echo [2/3] Setting up virtual environment...
echo.

:: Create virtual environment
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
) else (
    echo Virtual environment already exists, reusing it.
)

:: Activate virtual environment and install dependencies
echo.
echo [3/3] Installing dependencies...
echo.
call venv\Scripts\activate.bat
pip install flask fpdf2 requests pypdf
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

:: Write a helper start script with the user's configuration
(
    echo @echo off
    echo call venv\Scripts\activate.bat
    echo set FLASK_DEBUG=!FLASK_DEBUG!
    echo set BOOKS_DIR=!BOOKS_DIR!
    echo echo Starting LiteProducer on port !DOCKERLESS_PORT!...
    echo python app.py --port !DOCKERLESS_PORT!
) > start.bat
echo Created start.bat with your configuration.

if /i "!AUTO_START!"=="Y" (
    echo.
    echo Starting LiteProducer server...
    set FLASK_DEBUG=!FLASK_DEBUG!
    set BOOKS_DIR=!BOOKS_DIR!
    start "" cmd /c "call venv\Scripts\activate.bat && python app.py --port !DOCKERLESS_PORT!"
    echo Server started in a new window.
)

echo.
echo ============================================
echo   Installation complete!
echo   To start LiteProducer, run:
echo     start.bat
echo   Or manually:
echo     venv\Scripts\activate.bat
echo     python app.py --port !DOCKERLESS_PORT!
echo   Then access at http://localhost:!DOCKERLESS_PORT!
echo ============================================
goto end

:pwa
echo.
echo [1/3] Checking prerequisites...
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js ^>= 18 from https://nodejs.org/
    pause
    exit /b 1
)

:: Display Node version
echo Node.js found:
node --version

:: Check for Rust (required for Tauri desktop/mobile builds)
if "!PWA_TARGET!" neq "4" (
    where rustc >nul 2>nul
    if !errorlevel! neq 0 (
        echo [ERROR] Rust is not installed or not in PATH.
        echo Please install Rust from https://rustup.rs/
        pause
        exit /b 1
    )
    echo Rust found:
    rustc --version
)

:: Validate PWA_TARGET
if "!PWA_TARGET!" neq "1" if "!PWA_TARGET!" neq "2" if "!PWA_TARGET!" neq "3" if "!PWA_TARGET!" neq "4" (
    echo [ERROR] Invalid build target: !PWA_TARGET!
    pause
    exit /b 1
)

echo.
echo [2/3] Installing dependencies...
echo.

if not exist "pwa" (
    echo [ERROR] pwa directory not found. Please ensure the repository is complete.
    pause
    exit /b 1
)
cd pwa
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    cd ..
    pause
    exit /b 1
)

echo.
echo [3/3] Building PWA installer...
echo.

if "!PWA_TARGET!"=="1" (
    call npm run tauri:build
    if !errorlevel! neq 0 (
        echo [ERROR] Tauri build failed.
        cd ..
        pause
        exit /b 1
    )
    echo.
    echo ============================================
    echo   Build complete!
    echo   Windows installers:
    echo     src-tauri\target\release\bundle\nsis\liteproducer_1.0.0_x64-setup.exe
    echo     src-tauri\target\release\bundle\msi\liteproducer_1.0.0_x64.msi
    echo ============================================
)

if "!PWA_TARGET!"=="2" (
    call npm run tauri:android:init 2>nul
    call npm run tauri:android:build
    if !errorlevel! neq 0 (
        echo [ERROR] Android build failed.
        cd ..
        pause
        exit /b 1
    )
    echo.
    echo ============================================
    echo   Build complete!
    echo   Android APK:
    echo     src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk
    echo ============================================
)

if "!PWA_TARGET!"=="3" (
    call npm run tauri:ios:init 2>nul
    call npm run tauri:ios:build
    if !errorlevel! neq 0 (
        echo [ERROR] iOS build failed.
        cd ..
        pause
        exit /b 1
    )
    echo.
    echo ============================================
    echo   Build complete!
    echo   iOS IPA:
    echo     src-tauri\gen\apple\build\arm64\liteproducer.ipa
    echo ============================================
)

if "!PWA_TARGET!"=="4" (
    call npm run build
    if !errorlevel! neq 0 (
        echo [ERROR] Vite build failed.
        cd ..
        pause
        exit /b 1
    )
    echo.
    echo ============================================
    echo   Build complete!
    echo   PWA output: pwa\dist\
    echo   Deploy this folder to any static host.
    echo ============================================
)

cd ..
goto end

:: ============================================
:: Uninstall / Cleanup
:: ============================================

:uninstall
echo.
echo ============================================
echo   Uninstall / Cleanup
echo ============================================
echo.
echo What would you like to remove?
echo   1) Stop and remove Docker containers only
echo   2) Remove Docker containers and images
echo   3) Remove virtual environment (dockerless mode)
echo   4) Remove PWA build artifacts
echo   5) Full cleanup (all of the above)
echo   6) Cancel
echo.
set /p UNINSTALL_MODE="Enter choice (1-6): "

if "!UNINSTALL_MODE!"=="6" (
    echo Cancelled.
    goto end
)
if "!UNINSTALL_MODE!"=="1" goto uninstall_containers
if "!UNINSTALL_MODE!"=="2" goto uninstall_images
if "!UNINSTALL_MODE!"=="3" goto uninstall_venv
if "!UNINSTALL_MODE!"=="4" goto uninstall_pwa
if "!UNINSTALL_MODE!"=="5" goto uninstall_all

echo Invalid choice.
goto end

:uninstall_containers
echo.
echo Stopping and removing Docker containers...
docker compose down >nul 2>nul
docker compose -f docker-compose.standalone.yml down >nul 2>nul
del docker-compose.override.yml >nul 2>nul
del docker-compose.standalone.override.yml >nul 2>nul
echo Done.
goto end

:uninstall_images
echo.
echo Stopping and removing Docker containers and images...
docker compose down --rmi all >nul 2>nul
docker compose -f docker-compose.standalone.yml down --rmi all >nul 2>nul
del docker-compose.override.yml >nul 2>nul
del docker-compose.standalone.override.yml >nul 2>nul
echo Done.
goto end

:uninstall_venv
echo.
echo Removing virtual environment...
if exist "venv" (
    rmdir /s /q venv
    echo Virtual environment removed.
) else (
    echo No virtual environment found.
)
if exist "start.bat" del start.bat
echo Done.
goto end

:uninstall_pwa
echo.
echo Removing PWA build artifacts...
if exist "pwa\node_modules" (
    rmdir /s /q pwa\node_modules
    echo Node modules removed.
)
if exist "pwa\dist" (
    rmdir /s /q pwa\dist
    echo PWA dist folder removed.
)
if exist "pwa\src-tauri\target" (
    rmdir /s /q pwa\src-tauri\target
    echo Tauri build artifacts removed.
)
if exist "pwa\src-tauri\gen" (
    rmdir /s /q pwa\src-tauri\gen
    echo Tauri generated files removed.
)
echo Done.
goto end

:uninstall_all
echo.
echo Performing full cleanup...
docker compose down --rmi all >nul 2>nul
docker compose -f docker-compose.standalone.yml down --rmi all >nul 2>nul
del docker-compose.override.yml >nul 2>nul
del docker-compose.standalone.override.yml >nul 2>nul
if exist "venv" rmdir /s /q venv
if exist "start.bat" del start.bat
if exist "pwa\node_modules" rmdir /s /q pwa\node_modules
if exist "pwa\dist" rmdir /s /q pwa\dist
if exist "pwa\src-tauri\target" rmdir /s /q pwa\src-tauri\target
if exist "pwa\src-tauri\gen" rmdir /s /q pwa\src-tauri\gen
echo Full cleanup complete.
goto end

:: ============================================
:: Shared utilities
:: ============================================

:end
echo.
pause
exit /b 0

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
