@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
::  setup_and_run.bat
::  Automatically installs WinPython if missing, installs deps,
::  and launches tex_compiler.py -- no admin rights needed.
:: ============================================================

set "ROOT=%~dp0"
set "PYPYTHON=%ROOT%python312\python.exe"
set "SCRIPT=%ROOT%tex_compiler.py"

:: ---- 1. Sanity checks & Auto-Download -----------------------
if not exist "%PYPYTHON%" (
    echo [INFO] Portable Python not found.
    echo [INFO] Automating download of WinPython 3.12 'dot' edition...
    echo.
    
    :: Disable delayed expansion temporarily so characters like '!' aren't swallowed in PowerShell
    setlocal DisableDelayedExpansion
    
    :: Generate a temporary PowerShell script to handle the web requests and extraction safely
    echo [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 > "%ROOT%install_python.ps1"
    echo $ErrorActionPreference = 'Stop' >> "%ROOT%install_python.ps1"
    echo $releases = Invoke-RestMethod -Uri 'https://api.github.com/repos/winpython/winpython/releases' >> "%ROOT%install_python.ps1"
    echo $asset = $releases ^| ForEach-Object { $_.assets } ^| Where-Object { $_.name -match 'Winpython64-3.12.*dot\.exe' } ^| Select-Object -First 1 >> "%ROOT%install_python.ps1"
    echo if (-not $asset) { Write-Error 'Could not find WinPython 3.12 dot release'; exit 1 } >> "%ROOT%install_python.ps1"
    echo Write-Host "Downloading $($asset.name)... This may take a minute." >> "%ROOT%install_python.ps1"
    echo Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "%ROOT%winpy.exe" >> "%ROOT%install_python.ps1"
    echo Write-Host "Extracting WinPython silently..." >> "%ROOT%install_python.ps1"
    echo Start-Process -FilePath "%ROOT%winpy.exe" -ArgumentList '-y', '-o"%ROOT%winpy_temp"' -Wait -NoNewWindow >> "%ROOT%install_python.ps1"
    echo Write-Host "Setting up python312 directory..." >> "%ROOT%install_python.ps1"
    echo $pyDir = Get-ChildItem -Path "%ROOT%winpy_temp\WPy64-*\python-3.12*" -Directory ^| Select-Object -First 1 >> "%ROOT%install_python.ps1"
    echo Move-Item -Path $pyDir.FullName -Destination "%ROOT%python312" >> "%ROOT%install_python.ps1"
    echo Write-Host "Cleaning up temporary files..." >> "%ROOT%install_python.ps1"
    echo Remove-Item -Path "%ROOT%winpy_temp" -Recurse -Force >> "%ROOT%install_python.ps1"
    echo Remove-Item -Path "%ROOT%winpy.exe" -Force >> "%ROOT%install_python.ps1"
    endlocal

    :: Run the generated script
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%install_python.ps1"
    if exist "%ROOT%install_python.ps1" del "%ROOT%install_python.ps1"
    
    if not exist "%PYPYTHON%" (
        echo.
        echo [ERROR] Automated installation failed. Please check your internet connection.
        pause
        exit /b 1
    ) else (
        echo [OK] Portable Python installed successfully.
        echo.
    )
)

if not exist "%SCRIPT%" (
    echo [ERROR] tex_compiler.py not found at:
    echo          %SCRIPT%
    pause
    exit /b 1
)

:: ---- 2. Check tkinter is available --------------------------
echo [INFO] Checking tkinter...
"%PYPYTHON%" -c "import tkinter" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [WARN] tkinter is NOT available in this portable Python.
    echo.
    echo  GUI mode will be disabled; CLI mode is still available.
    echo  To restore GUI mode, use a Python build that includes tkinter, e.g.:
    echo.
    echo    WinPython -- https://winpython.github.io/
    echo.
) else (
    echo [OK] tkinter found.
)

:: ---- 3. Ensure pip is available -----------------------------
echo [INFO] Checking pip...
"%PYPYTHON%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [INFO] pip not found -- bootstrapping with ensurepip...
    "%PYPYTHON%" -m ensurepip --upgrade
    if errorlevel 1 (
        echo [ERROR] Could not bootstrap pip. Check your portable Python build.
        pause
        exit /b 1
    )
)

:: ---- 4. Upgrade pip silently --------------------------------
echo [INFO] Upgrading pip...
"%PYPYTHON%" -m pip install --upgrade pip --quiet

:: ---- 5. Install requirements --------------------------------
echo [INFO] Installing requirements...
"%PYPYTHON%" -m pip install --upgrade requests --quiet

echo.
echo [OK] Environment ready.
echo.

:: ---- 6. Launch ----------------------------------------------
echo [INFO] Launching tex_compiler.py...
"%PYPYTHON%" "%SCRIPT%"
set EXITCODE=%errorlevel%

if not "%EXITCODE%"=="0" (
    echo.
    echo [ERROR] The application crashed ^(exit code %EXITCODE%^).
    echo          See traceback above.
)

echo.
echo Press any key to close this window...
pause >nul

endlocal