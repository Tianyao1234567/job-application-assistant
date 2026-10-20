param([string]$CandidateRoot = '')
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:OS -ne 'Windows_NT') { throw 'HOSTED_WINDOWS_REQUIRED: Run only in the GitHub-hosted Windows candidate job.' }
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePrefix = $sourceRoot.TrimEnd('\') + '\'
$inputRoot = if ($CandidateRoot) { [IO.Path]::GetFullPath($CandidateRoot) } else { $sourceRoot }
if ($inputRoot -ne $sourceRoot -and -not $inputRoot.StartsWith((Join-Path $sourceRoot '.runtime') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'CONTROLLED_INPUT_REQUIRED: Candidate input must be inside this checkout runtime.' }
if (-not (Test-Path -LiteralPath $inputRoot -PathType Container)) { throw 'CANDIDATE_MISSING: Candidate input directory does not exist.' }
$testParent = Join-Path $sourceRoot ('.runtime\windows-candidate-' + [Guid]::NewGuid().ToString('N'))
$testCopy = Join-Path $testParent 'candidate with spaces 中文'
$evidenceDir = Join-Path $sourceRoot '.runtime\tests\evidence'
New-Item -ItemType Directory -Force -Path $testCopy,$evidenceDir | Out-Null
$evidenceFile = Join-Path $evidenceDir 'windows-candidate.json'
$results = New-Object Collections.ArrayList
$context = @{ key = $null; taskId = $null; fileHash = $null; serverPid = $null; lastCommand = $null }
$currentCase = 'copy-candidate'
$result = @{status='RUNNING'; commit=$env:GITHUB_SHA; githubActions=$true; platform='Windows'; powershell=$PSVersionTable.PSVersion.ToString(); candidateArchiveInput=[bool]$CandidateRoot; isolatedPathContainsSpacesAndChinese=$true; browserStarted=$false; browserInstalled=$false; results=$results}
$exitCode = 0
$blocker = $null
$originalPath = $env:PATH

function Assert-Test([bool]$condition,[string]$message) { if (-not $condition) { throw $message } }
function Check([string]$name,[scriptblock]$body) {
    $script:currentCase = $name
    & $body
    $null = $results.Add(@{name=$name;status='PASS'})
    Write-Host ('PASS ' + $name)
}
function Invoke-Candidate([string]$file,[string]$arguments='') {
    $command = Join-Path $testCopy $file
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /s /c ""' + $command + '" ' + $arguments + '"'
    $info.WorkingDirectory = $testCopy
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables['JOB_ASSISTANT_NONINTERACTIVE'] = '1'
    $child = New-Object Diagnostics.Process
    $child.StartInfo = $info
    $null = $child.Start()
    $stdout = $child.StandardOutput.ReadToEndAsync()
    $stderr = $child.StandardError.ReadToEndAsync()
    if (-not $child.WaitForExit(35000)) { $child.Kill(); throw 'COMMAND_TIMEOUT: Candidate command exceeded its bounded deadline.' }
    $output = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    $context.lastCommand = @{entry=$file;exitCode=$child.ExitCode;markers=@([Regex]::Matches($output,'\b[A-Z][A-Z0-9_]+:') | ForEach-Object {$_.Value.TrimEnd(':')} | Select-Object -Unique)}
    return @{exitCode=$child.ExitCode;output=$output}
}
function Private-Api([string]$route,[hashtable]$body=$null) {
    $headers = @{'X-Local-Key'=$context.key;Origin='http://127.0.0.1:17321'}
    if ($body) { $response = Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:17321/api'+$route) -Method POST -ContentType 'application/json; charset=utf-8' -Headers $headers -Body ($body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 5 }
    else { $response = Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:17321/api'+$route) -Headers $headers -TimeoutSec 5 }
    return ($response.Content | ConvertFrom-Json)
}
function Start-Blocker([int]$port) {
    $entry = Join-Path $testParent 'controlled-port-blocker.mjs'
    [IO.File]::WriteAllText($entry,"import http from 'node:http';import fs from 'node:fs';const server=http.createServer((q,s)=>{q.resume();s.end('<meta name=local-key content=fictional-not-a-project-key>');});server.listen(Number(process.argv[2]),'127.0.0.1',()=>fs.writeFileSync(process.argv[3],'ready'));",(New-Object Text.UTF8Encoding($false)))
    $ready = Join-Path $testParent 'blocker.ready'
    if (Test-Path -LiteralPath $ready) { Remove-Item -LiteralPath $ready -Force }
    $started = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"'+$entry+'"'),[string]$port,('"'+$ready+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $testParent 'blocker.log') -RedirectStandardError (Join-Path $testParent 'blocker.error.log')
    for ($attempt=0;$attempt -lt 40;$attempt++) { if (Test-Path -LiteralPath $ready) { return $started };Start-Sleep -Milliseconds 100 }
    if (-not $started.HasExited) { Stop-Process -Id $started.Id -Force }
    throw 'BLOCKER_START_FAILED: Controlled occupied-port fixture did not start.'
}
function Close-Blocker { if ($script:blocker) { $script:blocker.Refresh();if (-not $script:blocker.HasExited) { Stop-Process -Id $script:blocker.Id -Force };$script:blocker=$null } }

try {
    foreach ($directory in @('scripts','local-app','autofill-extension','runtime-deps')) {
        $from = Join-Path $inputRoot $directory
        Assert-Test (Test-Path -LiteralPath $from -PathType Container) 'CANDIDATE_LAYOUT: Required source directory is absent.'
        foreach ($item in Get-ChildItem -LiteralPath $from -Recurse -File -Force) {
            $relative = $item.FullName.Substring($inputRoot.Length).TrimStart('\')
            if ($relative -match '(?:^|[\\/])(?:node_modules|\.runtime)(?:[\\/]|$)') { continue }
            $destination = Join-Path $testCopy $relative
            New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
            Copy-Item -LiteralPath $item.FullName -Destination $destination
        }
    }
    foreach ($name in @('启动.cmd','停止.cmd','打开投递浏览器.cmd','安装运行环境.cmd','WINDOWS_START_001.md')) {
        Copy-Item -LiteralPath (Join-Path $inputRoot $name) -Destination (Join-Path $testCopy $name)
    }
    . (Join-Path $testCopy 'scripts\runtime.ps1')
    $result.node = (& $nodeExecutable -p 'process.version')
    Check 'dependency-missing-does-not-partly-start' {
        $missing = Invoke-Candidate '启动.cmd'
        Assert-Test ($missing.exitCode -ne 0 -and $missing.output.Contains('PLAYWRIGHT_REQUIRED')) 'DEPENDENCY_GUARD: Missing package did not produce the expected failure.'
        Assert-Test (-not (Get-ProjectProcess 'server')) 'DEPENDENCY_PARTIAL_START: Failed full start left a backend process.'
        Assert-Test ((Test-ProjectPortFree 17321) -and (Test-ProjectPortFree 17322)) 'DEPENDENCY_PORTS: Failed dependency check occupied a port.'
    }
    Check 'real-backend-start-in-spaces-and-chinese-path' {
        $started = Invoke-Candidate '启动.cmd' '-BackendOnly'
        Assert-Test ($started.exitCode -eq 0 -and $started.output.Contains('SERVER_READY')) 'START_COMMAND: Backend-only CMD did not report readiness.'
        Assert-Test (Test-ProjectServer) 'START_OWNERSHIP: Backend does not belong to the isolated candidate.'
        $context.serverPid = (Get-ProjectProcess 'server').ProcessId
        $context.key = (Get-Content -LiteralPath (Join-Path $runtimeRoot 'data\local-key') -Raw).Trim()
        $fixture = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:17322/site/beta/jobs' -TimeoutSec 5
        Assert-Test ($fixture.StatusCode -eq 200 -and $fixture.Content.Contains('data-job-id')) 'FIXTURE_READY: Actual fixture did not respond.'
        $unauthenticated = $null
        try { $unauthenticated = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:17321/api/state' -TimeoutSec 5 } catch { $unauthenticated = [int]$_.Exception.Response.StatusCode }
        Assert-Test ($unauthenticated -eq 401) 'AUTH_REQUIRED: State endpoint did not reject an unpaired request.'
        $null = Private-Api '/action' @{action='demo'}
        $added = Private-Api '/action' @{action='add';url='http://127.0.0.1:17322/site/alpha/jobs/cpp-002'}
        $context.taskId = $added.task.id
        $state = Private-Api '/state'
        Assert-Test ($state.profile.version -eq 1 -and $state.resume.version -eq 1 -and @($state.tasks).Count -eq 1) 'FICTIONAL_DATA: Controlled task and versions were not persisted.'
    }
    Check 'repeated-start-reuses-one-owned-service' {
        $again = Invoke-Candidate '启动.cmd' '-BackendOnly'
        Assert-Test ($again.exitCode -eq 0) 'REPEATED_START: Second CMD invocation failed.'
        Assert-Test ((Get-ProjectProcess 'server').ProcessId -eq $context.serverPid) 'REPEATED_PID: Second start replaced the service.'
        $entryPattern = '^\s*(?:"[^"]+"|[^\s"]+)\s+"' + [Regex]::Escape((Get-ProjectEntry 'server')) + '"\s*$'
        $copies = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and [Regex]::IsMatch($_.CommandLine,$entryPattern,[Text.RegularExpressions.RegexOptions]::IgnoreCase) })
        Assert-Test ($copies.Count -eq 1) 'REPEATED_COUNT: More than one backend wrapper exists.'
    }
    Check 'graceful-stop-retains-fictional-state-and-key' {
        $stopped = Invoke-Candidate '停止.cmd'
        Assert-Test ($stopped.exitCode -eq 0) 'STOP_COMMAND: Stop CMD failed.'
        Assert-Test (-not (Get-ProjectProcess 'server')) 'STOP_PROCESS: Owned wrapper remains running.'
        Assert-Test ((Test-ProjectPortFree 17321) -and (Test-ProjectPortFree 17322)) 'STOP_PORTS: Project ports remain occupied.'
        Assert-Test (Test-Path -LiteralPath (Join-Path $runtimeRoot 'server.stopped')) 'STOP_GRACEFUL: Application close callback did not finish.'
        $stored = Get-Content -LiteralPath (Join-Path $runtimeRoot 'data\state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        Assert-Test ($stored.paused -eq $true -and $stored.running -eq $false -and $stored.tasks[0].id -eq $context.taskId -and $stored.profile.version -eq 1 -and $stored.resume.version -eq 1) 'STOP_PERSISTENCE: Tasks or versions changed at shutdown.'
        Assert-Test ((Get-Content -LiteralPath (Join-Path $runtimeRoot 'data\local-key') -Raw).Trim() -eq $context.key) 'STOP_KEY: Local pairing key changed.'
        $context.fileHash = (Get-FileHash -LiteralPath (Join-Path $runtimeRoot 'data\state.json') -Algorithm SHA256).Hash
    }
    Check 'restart-retains-task-settings-and-versions' {
        $restarted = Invoke-Candidate '启动.cmd' '-BackendOnly'
        Assert-Test ($restarted.exitCode -eq 0) 'RESTART_COMMAND: Backend could not restart.'
        $state = Private-Api '/state'
        Assert-Test ($state.tasks[0].id -eq $context.taskId -and $state.profile.version -eq 1 -and $state.resume.version -eq 1 -and $state.settings.dailyLimit -eq 3 -and $state.settings.mode -eq 'demo' -and $state.paused -eq $true) 'RESTART_DATA: Same fictional task, settings, versions or safe pause were not retained.'
        $stopped = Invoke-Candidate '停止.cmd'
        Assert-Test ($stopped.exitCode -eq 0) 'RESTART_STOP: Restarted service could not close.'
        $twice = Invoke-Candidate '停止.cmd'
        Assert-Test ($twice.exitCode -eq 0) 'IDEMPOTENT_STOP: Repeated stop failed.'
    }
    foreach ($port in @(17321,17322)) {
        Check ('occupied-port-' + $port + '-is-not-our-service') {
            try {
                $script:blocker = Start-Blocker $port
                $rejected = Invoke-Candidate '启动.cmd' '-BackendOnly'
                Assert-Test ($rejected.exitCode -ne 0 -and $rejected.output.Contains(('PORT_OCCUPIED_'+$port))) 'OCCUPIED_PORT: Start did not identify the actual occupied port.'
                Assert-Test (-not (Get-ProjectProcess 'server')) 'OCCUPIED_PARTIAL_START: A backend was started despite the occupied port.'
                $blocker.Refresh();Assert-Test (-not $blocker.HasExited) 'OCCUPIED_OWNER: Foreign controlled process was stopped.'
                Assert-Test ((Get-FileHash -LiteralPath (Join-Path $runtimeRoot 'data\state.json') -Algorithm SHA256).Hash -eq $context.fileHash) 'OCCUPIED_DATA: Refused startup changed saved state.'
            } finally { Close-Blocker }
        }
    }
    Check 'stale-pid-never-stops-a-different-entry' {
        try {
            $script:blocker = Start-Blocker 17321
            [IO.File]::WriteAllText((Join-Path $runtimeRoot 'server.pid'),[string]$blocker.Id)
            $safeStop = Invoke-Candidate '停止.cmd'
            Assert-Test ($safeStop.exitCode -eq 0 -and $safeStop.output.Contains('STALE_PID')) 'PID_GUARD: A different entry was not explicitly refused.'
            $blocker.Refresh();Assert-Test (-not $blocker.HasExited) 'PID_FOREIGN_STOP: Stop affected the controlled foreign process.'
        } finally { Close-Blocker }
    }
    Check 'missing-node-is-actionable-and-does-not-start' {
        try {
            $env:PATH = (Join-Path $env:SystemRoot 'System32') + ';' + (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0')
            $missing = Invoke-Candidate '启动.cmd' '-BackendOnly'
            Assert-Test ($missing.exitCode -ne 0 -and $missing.output.Contains('NODE_REQUIRED')) 'NODE_GUARD: Missing Node did not produce an actionable failure.'
        } finally { $env:PATH=$originalPath }
        Assert-Test (-not (Get-ProjectProcess 'server')) 'NODE_PARTIAL_START: Missing Node left a backend process.'
    }
    $result.status = 'PASS'
} catch {
    $result.status = 'FAIL';$exitCode=1
    $result.failure=@{case=$currentCase;type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;message=$_.Exception.Message;lastCommand=$context.lastCommand}
    Write-Host ('::error title=Windows candidate failure::' + $currentCase + ' / ' + $_.Exception.Message)
} finally {
    $env:PATH = $originalPath
    Close-Blocker
    if (Test-Path -LiteralPath (Join-Path $testCopy 'scripts\stop.ps1')) {
        try { $null=Invoke-Candidate '停止.cmd' } catch { $result.status='FAIL';$exitCode=1 }
        try { $remaining=Get-ProjectProcess 'server';if ($remaining) { Stop-Process -Id $remaining.ProcessId -Force;$result.status='FAIL';$result.cleanupForcedProcess=$true;$exitCode=1 } } catch { $result.status='FAIL';$exitCode=1 }
    }
    $safeRelative = $testParent.Substring($sourcePrefix.Length)
    if (-not $testParent.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase) -or -not $safeRelative.StartsWith('.runtime\windows-candidate-') -or $safeRelative.Contains('..')) { $result.status='FAIL';$exitCode=1;$result.cleanup=$false }
    else {
        try { Remove-Item -LiteralPath $testParent -Recurse -Force;$result.cleanup=(-not (Test-Path -LiteralPath $testParent)) } catch { $result.cleanup=$false;$result.status='FAIL';$exitCode=1 }
    }
    $result.tests=$results.Count
    [IO.File]::WriteAllText($evidenceFile,($result | ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
}
if ($result.status -eq 'PASS') { Write-Host ('::notice title=Windows candidate final result::' + ($result | ConvertTo-Json -Depth 12 -Compress)) }
exit $exitCode
