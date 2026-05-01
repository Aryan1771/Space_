$ErrorActionPreference = "Stop"

$gpp = "C:\msys64\ucrt64\bin\g++.exe"
$windres = "C:\msys64\ucrt64\bin\windres.exe"
if (!(Test-Path $gpp)) {
    throw "MSYS2 g++ was not found at $gpp"
}

New-Item -ItemType Directory -Force -Path "build" | Out-Null

$resourceObject = $null
if ((Test-Path "assets\app.ico") -and (Test-Path $windres)) {
    & $windres src\app.rc -O coff -o build\app.res
    if ($LASTEXITCODE -ne 0) {
        throw "Resource compilation failed with exit code $LASTEXITCODE"
    }
    $resourceObject = "build\app.res"
    Write-Host "Embedding assets/app.ico"
} elseif (!(Test-Path "assets\app.ico")) {
    Write-Host "No assets/app.ico found; building without a custom executable icon"
}

$sources = @("src/main.cpp")
if ($resourceObject) {
    $sources += $resourceObject
}

& $gpp -std=c++17 -Wall -Wextra -Wpedantic -O2 `
    @sources `
    -o build/browser.exe

if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
}

Write-Host "Built build/browser.exe"
