$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $taskRoot '.runtime'
foreach ($part in @('tmp','cache','browsers','downloads','logs','data')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot $part) | Out-Null
}
$env:TEMP = Join-Path $runtimeRoot 'tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:npm_config_cache = Join-Path $runtimeRoot 'cache'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $runtimeRoot 'browsers'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'NODE_REQUIRED: 需要 Node.js 24。请先安装 Node.js 24；项目不会修改全局环境。' }
$nodeExecutable = $nodeCommand.Source
$nodeVersionOutput = & $nodeExecutable -p 'process.versions.node.split(".")[0]'
$nodeMajor = 0
if ($LASTEXITCODE -ne 0 -or -not [int]::TryParse(($nodeVersionOutput | Select-Object -First 1), [ref]$nodeMajor) -or $nodeMajor -lt 24) {
    throw 'NODE_VERSION: 需要 Node.js 24 或更新版本；候选包以 Node.js 24 验证。'
}

function Get-ProjectEntry([string]$name) {
    if ($name -eq 'server') { return (Join-Path $taskRoot 'scripts\windows-service.mjs') }
    if ($name -eq 'browser') { return (Join-Path $taskRoot 'scripts\browser.mjs') }
    throw 'PROCESS_NAME: 未识别的项目进程。'
}

function Get-ProjectProcess([string]$name) {
    $pidFile = Join-Path $runtimeRoot ($name + '.pid')
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $projectProcessId = 0
    try { $text = (Get-Content -LiteralPath $pidFile -Raw).Trim() } catch { return $null }
    if (-not [int]::TryParse($text, [ref]$projectProcessId) -or $projectProcessId -le 0) { return $null }
    $matched = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $projectProcessId) -ErrorAction SilentlyContinue
    $entryPath = Get-ProjectEntry $name
    # Require the current Node executable and exactly one complete entry argument.
    $entryPattern = '^\s*(?:"[^"]+"|[^\s"]+)\s+"' + [Regex]::Escape($entryPath) + '"\s*$'
    if ($matched -and $matched.ExecutablePath -and $matched.CommandLine -and
        [string]::Equals($matched.ExecutablePath, $nodeExecutable, [StringComparison]::OrdinalIgnoreCase) -and
        [Regex]::IsMatch($matched.CommandLine, $entryPattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) { return $matched }
    return $null
}

function Start-ProjectNode([string]$name) {
    $entryPath = Get-ProjectEntry $name
    $staleStop = Join-Path $runtimeRoot ($name + '.stop')
    if (Test-Path -LiteralPath $staleStop) { Remove-Item -LiteralPath $staleStop -Force }
    $logPath = Join-Path $runtimeRoot ('logs\' + $name + '.log')
    $errorPath = Join-Path $runtimeRoot ('logs\' + $name + '.error.log')
    $started = Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $entryPath + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
    [IO.File]::WriteAllText((Join-Path $runtimeRoot ($name + '.pid')), [string]$started.Id)
    return $started
}

function Test-ProjectPortFree([int]$port) {
    $listener = New-Object Net.Sockets.TcpListener -ArgumentList @([Net.IPAddress]::Loopback, $port)
    try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}

function Test-ProjectServer {
    if (-not (Get-ProjectProcess 'server')) { return $false }
    $keyFile = Join-Path $runtimeRoot 'data\local-key'
    if (-not (Test-Path -LiteralPath $keyFile)) { return $false }
    try {
        $privateKey = (Get-Content -LiteralPath $keyFile -Raw).Trim()
        if ($privateKey -notmatch '^[A-Za-z0-9_-]{32,256}$') { return $false }
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:17321/' -TimeoutSec 2 -UseBasicParsing
        return ($response.StatusCode -eq 200 -and $response.Content.Contains(('name="local-key" content="' + $privateKey + '"')))
    } catch { return $false }
}

function Assert-ProjectBrowserDependencies {
    $probe = @'
const fs=require('node:fs'),path=require('node:path');
try {
  const req=require('node:module').createRequire(path.join(process.argv[1],'runtime-deps','package.json'));
  if(req('playwright/package.json').version!=='1.58.2')process.exit(23);
  if(!fs.existsSync(req('playwright').chromium.executablePath()))process.exit(22);
} catch {process.exit(21);}
'@
    & $nodeExecutable -e $probe $taskRoot
    if ($LASTEXITCODE -eq 21) { throw 'PLAYWRIGHT_REQUIRED: 尚未安装项目浏览器依赖。请查看 WINDOWS_START_001.md；启动入口不会自行下载。' }
    if ($LASTEXITCODE -eq 22) { throw 'CHROMIUM_REQUIRED: 尚未下载项目专用 Chromium。请查看 WINDOWS_START_001.md；启动入口不会自行下载。' }
    if ($LASTEXITCODE -ne 0) { throw 'PLAYWRIGHT_VERSION: 项目需要锁定的 Playwright 1.58.2，请查看 WINDOWS_START_001.md。' }
}
