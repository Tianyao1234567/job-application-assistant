. (Join-Path $PSScriptRoot 'runtime.ps1')
$npmExecutable = Join-Path (Split-Path $nodeExecutable) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npmExecutable)) { throw 'NPM_REQUIRED: 未找到 Node.js 附带的 npm.cmd。' }
Push-Location (Join-Path $taskRoot 'runtime-deps')
$previousSkip = $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
try {
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    & $npmExecutable ci --ignore-scripts --no-audit --no-fund --cache $env:npm_config_cache
    if ($LASTEXITCODE -ne 0) { throw 'DEPENDENCY_INSTALL_FAILED: 项目内锁定依赖安装失败，请检查网络和 .runtime\cache。' }
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = $previousSkip
    & $nodeExecutable 'node_modules\playwright\cli.js' install chromium
    if ($LASTEXITCODE -ne 0) { throw 'CHROMIUM_INSTALL_FAILED: 项目内 Chromium 下载失败，请检查网络后再决定是否重试。' }
} finally {
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = $previousSkip
    Pop-Location
}
Write-Host 'SETUP_COMPLETE: 锁定依赖及项目 Chromium 已安装到本目录。请按 WINDOWS_START_001.md 做轻量验收。'
