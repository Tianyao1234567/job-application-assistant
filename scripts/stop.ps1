. (Join-Path $PSScriptRoot 'runtime.ps1')
# Only processes positively matched to this project's entry files may be stopped.
foreach ($name in @('browser','server')) {
    $pidFile = Join-Path $runtimeRoot ($name + '.pid')
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $projectProcessId = [int](Get-Content -LiteralPath $pidFile -Raw)
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $projectProcessId) -ErrorAction SilentlyContinue
    $entryPath = if ($name -eq 'browser') { Join-Path $taskRoot 'scripts\browser.mjs' } else { Join-Path $taskRoot 'local-app\server.mjs' }
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($entryPath)) {
        if ($name -eq 'browser') {
            # A stop signal lets Playwright close Chromium and flush the persistent profile.
            [IO.File]::WriteAllText((Join-Path $runtimeRoot 'browser.stop'), 'stop')
            for ($attempt = 0; $attempt -lt 50; $attempt++) {
                if (-not (Get-Process -Id $projectProcessId -ErrorAction SilentlyContinue)) { break }
                Start-Sleep -Milliseconds 200
            }
        } else {
            Stop-Process -Id $projectProcessId -ErrorAction SilentlyContinue
        }
    }
    Remove-Item -LiteralPath $pidFile -Force
}
Write-Host '本项目辅助进程已停止，登录配置和任务数据保留在 .runtime。'
