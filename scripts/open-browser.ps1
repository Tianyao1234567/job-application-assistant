. (Join-Path $PSScriptRoot 'runtime.ps1')
if (-not (Test-ProjectServer)) { throw '请先双击“启动.cmd”。' }
$browserPidFile = Join-Path $runtimeRoot 'browser.pid'
if (Test-Path -LiteralPath $browserPidFile) {
    $browserProcessId = [int](Get-Content -LiteralPath $browserPidFile -Raw)
    $browserProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $browserProcessId) -ErrorAction SilentlyContinue
    if ($browserProcess -and $browserProcess.CommandLine -and $browserProcess.CommandLine.Contains((Join-Path $taskRoot 'scripts\browser.mjs'))) {
        Write-Host '投递浏览器已运行。请在任务栏切换到该窗口。'
        return
    }
}
$null = Start-ProjectNode 'scripts\browser.mjs' 'browser'
Write-Host '正在打开项目专用的可见投递浏览器。首次安装请查看 WINDOWS_START_001.md。'
