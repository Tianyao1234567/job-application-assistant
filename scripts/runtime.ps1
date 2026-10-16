$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $taskRoot '.runtime'
foreach ($part in @('tmp','cache','browsers','downloads','logs','data','browser\production')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot $part) | Out-Null
}
$env:TEMP = Join-Path $runtimeRoot 'tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:npm_config_cache = Join-Path $runtimeRoot 'cache'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $runtimeRoot 'browsers'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '需要 Node.js 24。请先安装 Node.js 24，再双击启动；项目不会修改全局环境。' }
$nodeExecutable = $nodeCommand.Source
$nodeMajor = [int]((& $nodeExecutable -p 'process.versions.node.split(".")[0]') | Select-Object -First 1)
if ($nodeMajor -lt 24) { throw '需要 Node.js 24 或更新版本。' }

function Start-ProjectNode([string]$entry, [string]$name) {
    $entryPath = Join-Path $taskRoot $entry
    $logPath = Join-Path $runtimeRoot ('logs\' + $name + '.log')
    $errorPath = Join-Path $runtimeRoot ('logs\' + $name + '.error.log')
    $process = Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $entryPath + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
    [IO.File]::WriteAllText((Join-Path $runtimeRoot ($name + '.pid')), [string]$process.Id)
    return $process
}

function Test-ProjectServer {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:17321/' -TimeoutSec 2 -UseBasicParsing
        return ($response.StatusCode -eq 200 -and $response.Content.Contains('local-key'))
    } catch { return $false }
}
