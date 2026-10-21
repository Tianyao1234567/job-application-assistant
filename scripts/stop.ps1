. (Join-Path $PSScriptRoot 'runtime.ps1')
# Never stop a PID unless its current executable and exact entry belong to this copy.
$name = 'server'
$pidFile = Join-Path $runtimeRoot 'server.pid'
$owned = Get-ProjectProcess $name
if ($owned) {
    [IO.File]::WriteAllText((Join-Path $runtimeRoot 'server.stop'), 'stop')
    # Refuse new opens first. The application also owns shutdown; the shared
    # browser lock serializes it with an in-flight CMD or dashboard launch.
    Stop-ProjectBrowser
    for ($attempt = 0; $attempt -lt 360; $attempt++) {
        if (-not (Get-ProjectProcess $name)) { break }
        Start-Sleep -Milliseconds 150
    }
    if (Get-ProjectProcess $name) { throw 'STOP_TIMEOUT: server 尚未正常关闭，保留PID和数据供检查；未强制结束其他程序。' }
} elseif (Test-Path -LiteralPath $pidFile) {
    Write-Host 'STALE_PID: server PID不属于本项目，未停止该程序。'
}
Stop-ProjectBrowser
if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
Write-Host 'PROJECT_STOPPED: 本项目辅助进程已停止，任务数据与登录配置保留在 .runtime；没有删除数据。'
