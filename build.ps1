$ErrorActionPreference = "Stop"

$gpp = "C:\msys64\ucrt64\bin\g++.exe"
if (!(Test-Path $gpp)) {
    throw "MSYS2 g++ was not found at $gpp"
}

New-Item -ItemType Directory -Force -Path "build" | Out-Null

& $gpp -std=c++17 -Wall -Wextra -Wpedantic -O2 `
    src/main.cpp `
    -o build/browser.exe

if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
}

Write-Host "Built build/browser.exe"
