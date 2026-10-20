. (Join-Path $PSScriptRoot 'runtime.ps1')
if (-not (Test-ProjectServer)) { throw 'SERVER_REQUIRED: 请先双击“启动.cmd”，或先启动本项目后台。' }
$browserLock = $null
try {
    try { $browserLock = [IO.File]::Open((Join-Path $runtimeRoot 'browser-start.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'BROWSER_START_IN_PROGRESS: 投递浏览器正在启动，请稍后查看原窗口。' }
    if (Get-ProjectProcess 'browser') {
        Write-Host 'BROWSER_ALREADY_RUNNING: 投递浏览器已运行，请在任务栏切换到原窗口。'
        return
    }
    Assert-ProjectBrowserDependencies
    $launcher = Start-ProjectNode 'browser'
    Start-Sleep -Milliseconds 700
    if (-not (Get-ProjectProcess 'browser')) { throw 'BROWSER_START_FAILED: 浏览器未能启动，请查看 .runtime\logs\browser.error.log。' }
    Write-Host 'BROWSER_LAUNCH_REQUESTED: 已请求打开一个项目专用浏览器。请确认实际窗口和后台连接；此提示不代表扩展已就绪。说明见 WINDOWS_START_001.md。'
} finally { if ($browserLock) { $browserLock.Dispose() } }
