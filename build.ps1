$ErrorActionPreference = "Stop"

$webViewVersion = "1.0.3912.50"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$deps = Join-Path $repo "deps"
$sdk = Join-Path $deps "Microsoft.Web.WebView2"
$sdkHeader = Join-Path $sdk "build\native\include\WebView2.h"
$sdkLib = Join-Path $sdk "build\native\x64\WebView2LoaderStatic.lib"
$vsDevCmd = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"

Set-Location $repo
New-Item -ItemType Directory -Force -Path "build", $deps | Out-Null

if (!(Test-Path $sdkHeader) -or !(Test-Path $sdkLib)) {
    $nupkg = Join-Path $deps "Microsoft.Web.WebView2.$webViewVersion.nupkg"
    $zip = Join-Path $deps "Microsoft.Web.WebView2.$webViewVersion.zip"
    $url = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$webViewVersion"
    Write-Host "Downloading Microsoft WebView2 SDK $webViewVersion..."
    Invoke-WebRequest -Uri $url -OutFile $nupkg
    Copy-Item $nupkg $zip -Force
    if (Test-Path $sdk) {
        Remove-Item $sdk -Recurse -Force
    }
    Expand-Archive -Path $zip -DestinationPath $sdk -Force
}

if (!(Test-Path $vsDevCmd)) {
    throw "Visual Studio C++ build tools were not found. Install 'Desktop development with C++' in Visual Studio Installer."
}

if (!(Test-Path "assets\app.ico")) {
    Write-Host "assets/app.ico was not found; building with the default Windows icon."
}

$cmdPath = Join-Path $env:TEMP "build-space-browser.cmd"
$cmd = @"
@echo off
call "$vsDevCmd" -arch=x64 -host_arch=x64
if errorlevel 1 exit /b %errorlevel%
cd /d "$repo"
rc /nologo /fo "build\app.res" "src\app.rc"
if errorlevel 1 exit /b %errorlevel%
cl /nologo /std:c++17 /EHsc /utf-8 /O2 /MT /W4 /DUNICODE /D_UNICODE /I "$sdk\build\native\include" "src\main.cpp" "build\app.res" /link /SUBSYSTEM:WINDOWS /OUT:"build\Space_.exe" "$sdk\build\native\x64\WebView2LoaderStatic.lib" user32.lib gdi32.lib ole32.lib shell32.lib shlwapi.lib advapi32.lib version.lib runtimeobject.lib
if errorlevel 1 exit /b %errorlevel%
"@
Set-Content -Path $cmdPath -Value $cmd -Encoding ASCII

cmd.exe /d /c "`"$cmdPath`""
if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
}

Write-Host "Built build\Space_.exe"
