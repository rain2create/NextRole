param([switch]$Restart)
if ($Restart) {
    $nextrolePidPath = Join-Path $PSScriptRoot 'nextrole-server.pid'
    if (Test-Path -LiteralPath $nextrolePidPath) {
        $nextroleOldPid = [int](Get-Content -LiteralPath $nextrolePidPath)
        $nextroleOldProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $nextroleOldPid"
        if ($nextroleOldProcess -and $nextroleOldProcess.Name -eq 'node.exe' -and $nextroleOldProcess.CommandLine -match 'node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next.*start.*127\.0\.0\.1') {
            Stop-Process -Id $nextroleOldPid -ErrorAction Stop
            Start-Sleep -Seconds 1
        }
    }
}
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
# Use the current Windows HTTP proxy when one is enabled.
$nextroleSettings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
$nextroleProxy = [string]$nextroleSettings.ProxyServer
if ($nextroleSettings.ProxyEnable -eq 1 -and $nextroleProxy -and -not $nextroleProxy.Contains('=')) {
    if ($nextroleProxy -notmatch '^https?://') { $nextroleProxy = 'http://' + $nextroleProxy }
    $env:HTTP_PROXY = $nextroleProxy
    $env:HTTPS_PROXY = $nextroleProxy
    $env:NO_PROXY = 'localhost,127.0.0.1,::1'
    $env:NODE_USE_ENV_PROXY = '1'
}
$nextroleUrl = 'http://127.0.0.1:3000'
$nextroleReady = $false
try {
    $nextroleResponse = Invoke-RestMethod "$nextroleUrl/api/profile" -TimeoutSec 2
    $nextroleReady = $null -ne $nextroleResponse.ai
} catch {}
if (-not $nextroleReady) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.next\BUILD_ID'))) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed. See terminal output.' }
    }
    $nextroleNode = (Get-Command node.exe).Source
    $nextroleServer = Start-Process -FilePath $nextroleNode -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'nextrole-server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'nextrole-server-error.log') -PassThru
    Set-Content -LiteralPath (Join-Path $PSScriptRoot 'nextrole-server.pid') -Value $nextroleServer.Id
    for ($nextroleAttempt = 0; $nextroleAttempt -lt 30; $nextroleAttempt++) {
        Start-Sleep -Seconds 1
        try {
            $nextroleResponse = Invoke-RestMethod "$nextroleUrl/api/profile" -TimeoutSec 2
            if ($null -ne $nextroleResponse.ai) { $nextroleReady = $true; break }
        } catch {}
        if ($nextroleServer.HasExited) { break }
    }
}
if (-not $nextroleReady) { throw 'Server failed to start. Check nextrole-server-error.log.' }
Start-Process "$nextroleUrl/app"
Write-Output "NextRole is running: $nextroleUrl/app"