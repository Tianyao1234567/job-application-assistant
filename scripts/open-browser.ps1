param([switch]$Close)
. (Join-Path $PSScriptRoot 'runtime.ps1')
if ($Close) { Stop-ProjectBrowser; return }
if (Test-Path -LiteralPath (Join-Path $runtimeRoot 'server.stop')) { throw 'SERVER_STOPPING: 后台正在停止，请等待停止完成。' }
if (-not (Test-ProjectServer)) { throw 'SERVER_REQUIRED: 请先双击“启动.cmd”，或先启动本项目后台。' }
$browserLock = $null
$deadline = [DateTime]::UtcNow.AddSeconds(35)
try {
    # UI and CMD wait on the same lock and then reuse the same ready instance.
    while (-not $browserLock -and [DateTime]::UtcNow -lt $deadline) {
        try { $browserLock = [IO.File]::Open((Join-Path $runtimeRoot 'browser-start.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
        catch { Start-Sleep -Milliseconds 150 }
    }
    if (-not $browserLock) { throw 'BROWSER_START_IN_PROGRESS: 投递浏览器仍在启动，请保留数据并检查项目日志。' }
    if (Test-Path -LiteralPath (Join-Path $runtimeRoot 'server.stop')) { throw 'SERVER_STOPPING: 后台正在停止，请等待停止完成。' }
    $alreadyRunning = [bool](Get-ProjectProcess 'browser')
    if (-not $alreadyRunning) {
        Assert-ProjectBrowserDependencies
        $launcher = Start-ProjectNode 'browser'
    }
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath (Join-Path $runtimeRoot 'server.stop')) {
            Stop-ProjectBrowser -LockHeld
            throw 'SERVER_STOPPING: 后台正在停止，已关闭本项目浏览器。'
        }
        if (Test-ProjectBrowserReady) {
            if ($alreadyRunning) { Write-Host 'BROWSER_ALREADY_RUNNING: 已复用原项目投递浏览器，真实插件心跳已确认。' }
            else { Write-Host 'BROWSER_READY: 一个项目专用投递浏览器已启动，真实插件心跳已确认。' }
            return
        }
        if (-not (Get-ProjectProcess 'browser')) { throw 'BROWSER_START_FAILED: 浏览器或扩展连接失败，请查看 .runtime\logs\browser.error.log。' }
        Start-Sleep -Milliseconds 200
    }
    Stop-ProjectBrowser -LockHeld
    throw 'BROWSER_READY_TIMEOUT: 浏览器未建立真实扩展连接，已请求关闭本项目实例；请查看 .runtime\logs\browser.error.log。'
} finally { if ($browserLock) { $browserLock.Dispose() } }
