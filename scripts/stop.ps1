. (Join-Path $PSScriptRoot 'runtime.ps1')
# Never stop a PID unless its current executable and exact entry belong to this copy.
foreach ($name in @('browser','server')) {
    $pidFile = Join-Path $runtimeRoot ($name + '.pid')
    $owned = Get-ProjectProcess $name
    if ($owned) {
        [IO.File]::WriteAllText((Join-Path $runtimeRoot ($name + '.stop')), 'stop')
        for ($attempt = 0; $attempt -lt 80; $attempt++) {
            if (-not (Get-ProjectProcess $name)) { break }
            Start-Sleep -Milliseconds 150
        }
        if (Get-ProjectProcess $name) { throw ('STOP_TIMEOUT: ' + $name + ' 尚未正常关闭，保留PID和数据供检查；未强制结束其他程序。') }
    } elseif (Test-Path -LiteralPath $pidFile) {
        Write-Host ('STALE_PID: ' + $name + ' PID不属于本项目，未停止该程序。')
    }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
}
Write-Host 'PROJECT_STOPPED: 本项目辅助进程已停止，任务数据与登录配置保留在 .runtime；没有删除数据。'
