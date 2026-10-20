param([switch]$BackendOnly)
. (Join-Path $PSScriptRoot 'runtime.ps1')
# Dependency failure must not leave a partly started service behind.
if (-not $BackendOnly) { Assert-ProjectBrowserDependencies }
$startLock = $null
try {
    try { $startLock = [IO.File]::Open((Join-Path $runtimeRoot 'start.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'START_IN_PROGRESS: 本项目启动正在进行，请稍后重试；不会另开后台。' }
    if (-not (Test-ProjectServer)) {
        $existing = Get-ProjectProcess 'server'
        if (-not $existing) {
            foreach ($port in @(17321,17322)) {
                if (-not (Test-ProjectPortFree $port)) { throw ('PORT_OCCUPIED_' + $port + ': 端口 ' + $port + ' 已被其他程序占用。未启动项目，也不会停止其他程序。') }
            }
            $service = Start-ProjectNode 'server'
        }
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            if (Test-ProjectServer) { break }
            if (-not (Get-ProjectProcess 'server')) { throw 'SERVER_START_FAILED: 后台启动失败，请查看项目 .runtime\logs\server.error.log。' }
            Start-Sleep -Milliseconds 200
        }
        if (-not (Test-ProjectServer)) { throw 'SERVER_START_TIMEOUT: 本地后台尚未就绪，请检查项目 .runtime\logs 与端口 17321、17322。' }
    }
    if (-not $BackendOnly) { & (Join-Path $PSScriptRoot 'open-browser.ps1') }
    Write-Host 'SERVER_READY: 本地后台已启动：http://127.0.0.1:17321/。关闭窗口不会关闭后台；请用“停止.cmd”结束本项目。'
    if ($BackendOnly) { Write-Host 'BACKEND_ONLY: 本次只启动后台和虚构测试站，没有启动浏览器。' }
} finally { if ($startLock) { $startLock.Dispose() } }
