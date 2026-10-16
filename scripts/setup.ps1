. (Join-Path $PSScriptRoot 'runtime.ps1')
$npmExecutable = Join-Path (Split-Path $nodeExecutable) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npmExecutable)) { throw '未找到 Node.js 附带的 npm.cmd。' }
Push-Location (Join-Path $taskRoot 'autofill-extension')
try {
    & $npmExecutable install --no-audit --no-fund --cache $env:npm_config_cache
    if ($LASTEXITCODE -ne 0) { throw '项目内依赖安装失败，请检查网络和 .runtime\cache\_logs。' }
    & $nodeExecutable 'node_modules\playwright\cli.js' install chromium
    if ($LASTEXITCODE -ne 0) { throw '项目内 Chromium 下载失败。可稍后重新运行“安装运行环境.cmd”。' }
} finally { Pop-Location }
Write-Host '运行环境已安装到本项目目录。现在可双击“启动.cmd”。'
