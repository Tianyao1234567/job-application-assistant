param(
    [string]$CandidateRoot = '',
    [switch]$CommandOnly,
    [switch]$StatusOnly,
    [ValidateSet('start','stop','browser')][string]$Entry='start',
    [switch]$BackendOnly,
    [string]$RememberedPids=''
)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:OS -ne 'Windows_NT') { throw 'HOSTED_WINDOWS_REQUIRED: Use only the explicit GitHub-hosted Windows browser job.' }
$sourceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $CandidateRoot) { throw 'CANDIDATE_REQUIRED: Supply the verified extracted source candidate.' }
$inputRoot=[IO.Path]::GetFullPath($CandidateRoot)
$runtimePrefix=(Join-Path $sourceRoot '.runtime').TrimEnd('\')+'\'
if (-not $inputRoot.StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'CONTROLLED_CANDIDATE_REQUIRED: Candidate must be inside this checkout runtime.' }
if (-not (Test-Path -LiteralPath $inputRoot -PathType Container)) { throw 'CANDIDATE_MISSING: Verified candidate directory is absent.' }

function Read-BoundedLog([string]$file) {
    if (-not (Test-Path -LiteralPath $file)) { return '' }
    $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::Default,$true)
    try { $characters=New-Object char[] 32768;$count=$reader.ReadBlock($characters,0,$characters.Length);return [string]::new($characters,0,$count) } finally { $reader.Dispose() }
}
function Invoke-Wrapper([string]$root,[string]$name,[bool]$backend) {
    $filename = if ($name -eq 'start') {'启动.cmd'} elseif ($name -eq 'stop') {'停止.cmd'} else {'打开投递浏览器.cmd'}
    if ($backend -and $name -ne 'start') { throw 'FIXED_COMMAND_REQUIRED: BackendOnly is valid only for start.' }
    $directory=Join-Path $root '.runtime\browser-test-commands'
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $sequence=[Guid]::NewGuid().ToString('N')
    $out=Join-Path $directory ($sequence+'.stdout.log');$err=Join-Path $directory ($sequence+'.stderr.log')
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$env:ComSpec
    $arguments=if($backend){'-BackendOnly'}else{''}
    $info.Arguments='/d /s /c ""'+(Join-Path $root $filename)+'" '+$arguments+' 1>"'+$out+'" 2>"'+$err+'""'
    $info.WorkingDirectory=$root;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.EnvironmentVariables['JOB_ASSISTANT_NONINTERACTIVE']='1'
    $child=New-Object Diagnostics.Process;$child.StartInfo=$info;$null=$child.Start()
    if(-not $child.WaitForExit(90000)){$child.Kill();throw 'CMD_TIMEOUT: Fixed browser command exceeded ninety seconds.'}
    $output=(Read-BoundedLog $out)+(Read-BoundedLog $err)
    return @{exitCode=$child.ExitCode;markers=@([Regex]::Matches($output,'\b[A-Z][A-Z0-9_]+:')|ForEach-Object{$_.Value.TrimEnd(':')}|Select-Object -Unique)}
}
if ($CommandOnly) {
    $value=Invoke-Wrapper $inputRoot $Entry ([bool]$BackendOnly)
    Write-Output ($value|ConvertTo-Json -Depth 5 -Compress)
    exit 0
}
if ($StatusOnly) {
    . (Join-Path $inputRoot 'scripts\runtime.ps1')
    $browser=Get-ProjectProcess 'browser';$server=Get-ProjectProcess 'server'
    $rows=@(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='chrome.exe'" -ErrorAction Stop)
    $profile=Join-Path $inputRoot '.runtime\browser\production'
    $driverPrefix=Join-Path $inputRoot 'runtime-deps\node_modules\playwright-core\'
    $roots=@($rows|Where-Object{$_.Name -eq 'chrome.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($profile,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine.Contains('--user-data-dir=') -and $_.CommandLine -notmatch '(?:^|\s)--type='})
    $ids=New-Object 'Collections.Generic.HashSet[int]'
    if($browser){$null=$ids.Add([int]$browser.ProcessId)}
    if($server){$null=$ids.Add([int]$server.ProcessId)}
    foreach($row in $roots){$null=$ids.Add([int]$row.ProcessId)}
    foreach($row in $rows){if($row.Name -eq 'node.exe' -and $row.CommandLine -and $row.CommandLine.IndexOf($driverPrefix,[StringComparison]::OrdinalIgnoreCase) -ge 0){$null=$ids.Add([int]$row.ProcessId)}}
    $changed=$true
    while($changed){$changed=$false;foreach($row in $rows){if($ids.Contains([int]$row.ParentProcessId) -and $ids.Add([int]$row.ProcessId)){$changed=$true}}}
    $known=@($ids|Sort-Object);$chromium=@($rows|Where-Object{$_.Name -eq 'chrome.exe' -and $ids.Contains([int]$_.ProcessId)}|ForEach-Object{[int]$_.ProcessId}|Sort-Object)
    $alive=0
    if($RememberedPids){if($RememberedPids -notmatch '^\d+(?:,\d+)*$'){throw 'REMEMBERED_PID_FORMAT: Expected a bounded numeric process list.'};foreach($value in $RememberedPids.Split(',')){if(Get-Process -Id ([int]$value) -ErrorAction SilentlyContinue){$alive++}}}
    Write-Output (@{ownedLaunchers=@($(if($browser){[int]$browser.ProcessId}));ownedServers=@($(if($server){[int]$server.ProcessId}));ownedChrome=$chromium;ownedAll=$known;chromeRoots=@($roots|ForEach-Object{[int]$_.ProcessId}|Sort-Object);rememberedAlive=$alive}|ConvertTo-Json -Depth 5 -Compress)
    exit 0
}

$testParent=Join-Path $sourceRoot ('.runtime\windows-browser-'+[Guid]::NewGuid().ToString('N'))
$testCopy=Join-Path $testParent 'candidate with spaces 中文'
$evidenceFile=Join-Path $sourceRoot '.runtime\tests\evidence\windows-browser.json'
$exitCode=0;$phase='copy-candidate';$testResult=$null
$oldBrowserTest=$env:JOB_ASSISTANT_BROWSER_TEST
try {
    New-Item -ItemType Directory -Force -Path $testCopy,(Split-Path $evidenceFile) | Out-Null
    foreach($directory in @('scripts','local-app','autofill-extension','runtime-deps')){
        $from=Join-Path $inputRoot $directory
        if(-not(Test-Path -LiteralPath $from -PathType Container)){throw 'CANDIDATE_LAYOUT: Required source directory is absent.'}
        foreach($item in Get-ChildItem -LiteralPath $from -File -Recurse -Force){
            $relative=$item.FullName.Substring($inputRoot.Length).TrimStart('\')
            if($relative -match '(?:^|[\\/])(?:node_modules|\.runtime)(?:[\\/]|$)'){continue}
            $to=Join-Path $testCopy $relative;New-Item -ItemType Directory -Force -Path (Split-Path $to)|Out-Null;Copy-Item -LiteralPath $item.FullName -Destination $to
        }
    }
    foreach($name in @('启动.cmd','停止.cmd','打开投递浏览器.cmd','安装运行环境.cmd','WINDOWS_START_001.md')){Copy-Item -LiteralPath (Join-Path $inputRoot $name) -Destination (Join-Path $testCopy $name)}
    . (Join-Path $testCopy 'scripts\runtime.ps1')
    $phase='install-locked-runtime'
    $npm=Join-Path (Split-Path $nodeExecutable) 'npm.cmd'
    if(-not(Test-Path -LiteralPath $npm)){throw 'NPM_REQUIRED: Locked runtime installation needs Node npm.'}
    Push-Location (Join-Path $testCopy 'runtime-deps')
    try {
        $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'
        & $npm ci --ignore-scripts --no-audit --no-fund --cache $env:npm_config_cache
        if($LASTEXITCODE -ne 0){throw 'LOCKED_RUNTIME_INSTALL_FAILED'}
        $phase='install-headed-chromium'
        $env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT='45000'
        & $nodeExecutable 'node_modules\playwright\cli.js' install --no-shell chromium
        if($LASTEXITCODE -ne 0){throw 'CHROMIUM_INSTALL_FAILED'}
    } finally {Pop-Location}
    $env:JOB_ASSISTANT_BROWSER_TEST='1'
    $phase='real-managed-browser-scenarios'
    & $nodeExecutable (Join-Path $sourceRoot 'scripts\test-windows-browser.mjs') $testCopy
    if($LASTEXITCODE -ne 0){$exitCode=1}
    if(Test-Path -LiteralPath $evidenceFile){$testResult=Get-Content -LiteralPath $evidenceFile -Raw -Encoding UTF8|ConvertFrom-Json}else{throw 'BROWSER_EVIDENCE_REQUIRED: Scenario script produced no evidence.'}
} catch {
    $exitCode=1
    if(-not $testResult){$testResult=[PSCustomObject]@{status='FAIL';sourceSHA=$env:GITHUB_SHA;platform='Windows';phase=$phase;failureType=$_.Exception.GetType().Name;code='WINDOWS_BROWSER_STEP_FAILED'}}
} finally {
    if(Test-Path -LiteralPath (Join-Path $testCopy '停止.cmd')){
        try{$stop=Invoke-Wrapper $testCopy 'stop' $false;if($stop.exitCode -ne 0){$exitCode=1}}catch{$exitCode=1}
    }
    $env:JOB_ASSISTANT_BROWSER_TEST=$oldBrowserTest
    if(-not $testResult){$testResult=[PSCustomObject]@{status='FAIL';sourceSHA=$env:GITHUB_SHA;phase=$phase}}
    $testResult|Add-Member -NotePropertyName powershell -NotePropertyValue $PSVersionTable.PSVersion.ToString() -Force
    $testResult|Add-Member -NotePropertyName candidateArchiveInput -NotePropertyValue $true -Force
    $safe=$testParent.StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $testParent -Leaf).StartsWith('windows-browser-')
    $clean=$false
    if($safe){try{Remove-Item -LiteralPath $testParent -Recurse -Force;$clean=(-not(Test-Path -LiteralPath $testParent))}catch{$clean=$false}}
    if(-not $clean){$exitCode=1}
    $testResult|Add-Member -NotePropertyName cleanup -NotePropertyValue $clean -Force
    $testResult|Add-Member -NotePropertyName isolatedPathContainsSpacesAndChinese -NotePropertyValue $true -Force
    if($exitCode -ne 0){$testResult.status='FAIL'}
    [IO.File]::WriteAllText($evidenceFile,($testResult|ConvertTo-Json -Depth 15),(New-Object Text.UTF8Encoding($false)))
}
$summary=$testResult|ConvertTo-Json -Depth 15 -Compress
if([Text.Encoding]::UTF8.GetByteCount($summary) -gt 3750){$summary=@{status=$testResult.status;sourceSHA=$env:GITHUB_SHA;phase=$phase;cleanup=$testResult.cleanup;summaryTruncated=$true}|ConvertTo-Json -Compress}
if($testResult.status -eq 'PASS'){Write-Host ('::notice title=Windows visible browser final result::'+$summary)}else{Write-Host ('::error title=Windows visible browser failure::'+$summary)}
exit $exitCode
