$ErrorActionPreference = "Stop"

$gpp = "C:\msys64\ucrt64\bin\g++.exe"
if (!(Test-Path $gpp)) {
    throw "g++ was not found at $gpp"
}

New-Item -ItemType Directory -Force -Path "build" | Out-Null
& $gpp -std=c++17 -Wall -Wextra -O2 `
    src/main.cpp `
    src/browser.cpp `
    src/content.cpp `
    src/net.cpp `
    src/security.cpp `
    -lwininet `
    -o build/safe_gx_browser.exe

if ($LASTEXITCODE -ne 0) {
    throw "C++ build failed with exit code $LASTEXITCODE"
}

Write-Host "Built cpp_browser/build/safe_gx_browser.exe"
