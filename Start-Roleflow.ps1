param([switch]$Restart)
if ($Restart) {
    $roleflowPidPath = Join-Path $PSScriptRoot 'roleflow-server.pid'
    if (Test-Path -LiteralPath $roleflowPidPath) {
        $roleflowOldPid = [int](Get-Content -LiteralPath $roleflowPidPath)
        $roleflowOldProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $roleflowOldPid"
        if ($roleflowOldProcess -and $roleflowOldProcess.Name -eq 'node.exe' -and $roleflowOldProcess.CommandLine -match 'node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next.*start.*127\.0\.0\.1') {
            Stop-Process -Id $roleflowOldPid -ErrorAction Stop
            Start-Sleep -Seconds 1
        }
    }
}
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:OPENAI_API_KEY = $null
$roleflowUrl = 'http://127.0.0.1:3000'
$roleflowReady = $false
try {
    $roleflowResponse = Invoke-RestMethod "$roleflowUrl/api/profile" -TimeoutSec 2
    $roleflowReady = $null -ne $roleflowResponse.openai
} catch {}
if (-not $roleflowReady) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.next\BUILD_ID'))) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed. See terminal output.' }
    }
    $roleflowNode = (Get-Command node.exe).Source
    $roleflowServer = Start-Process -FilePath $roleflowNode -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'roleflow-server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'roleflow-server-error.log') -PassThru
    Set-Content -LiteralPath (Join-Path $PSScriptRoot 'roleflow-server.pid') -Value $roleflowServer.Id
    for ($roleflowAttempt = 0; $roleflowAttempt -lt 30; $roleflowAttempt++) {
        Start-Sleep -Seconds 1
        try {
            $roleflowResponse = Invoke-RestMethod "$roleflowUrl/api/profile" -TimeoutSec 2
            if ($null -ne $roleflowResponse.openai) { $roleflowReady = $true; break }
        } catch {}
        if ($roleflowServer.HasExited) { break }
    }
}
if (-not $roleflowReady) { throw 'Server failed to start. Check roleflow-server-error.log.' }
Start-Process "$roleflowUrl/app"
Write-Output "Roleflow is running: $roleflowUrl/app"