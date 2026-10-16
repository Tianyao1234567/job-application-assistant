. (Join-Path $PSScriptRoot 'runtime.ps1')
if (-not (Test-ProjectServer)) {
    $service = Start-ProjectNode 'local-app\server.mjs' 'server'
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        if (Test-ProjectServer) { break }
        if ($service.HasExited) { throw ('启动失败，请查看 ' + (Join-Path $runtimeRoot 'logs\server.error.log')) }
        Start-Sleep -Milliseconds 200
    }
    if (-not (Test-ProjectServer)) { throw '本地网站尚未启动。请检查 .runtime\logs\server.error.log 和端口 17321、17322。' }
}
& (Join-Path $PSScriptRoot 'open-browser.ps1')
Write-Host '网站已启动：http://127.0.0.1:17321/。关闭浏览器不会关闭网站；请用“停止.cmd”结束本项目。'
