# installed by DevHub — managed block, do not edit (version marker DEVHUB_HOOKS_VERSION=1)
# usage: devhub-agent-state.ps1 -State <working|blocked|idle|session> -Event <event> -Agent <agent>
param(
    [string]$State = "",
    [string]$Event = "",
    [string]$Agent = "unknown"
)

if (@("working", "blocked", "idle", "session") -notcontains $State) { exit 0 }
if ($env:DEVHUB_HOOK_ENV -ne "1") { exit 0 }
if ([string]::IsNullOrWhiteSpace($env:DEVHUB_HOOK_URL)) { exit 0 }
if ([string]::IsNullOrWhiteSpace($env:DEVHUB_TERMINAL_ID)) { exit 0 }
if ([string]::IsNullOrWhiteSpace($env:DEVHUB_HOOK_TOKEN)) { exit 0 }

$inputText = [Console]::In.ReadToEnd()
try {
    $parsed = if ([string]::IsNullOrWhiteSpace($inputText)) { $null } else { $inputText | ConvertFrom-Json }
} catch {
    $parsed = $null
}

$agentSessionId = if ($null -ne $parsed -and -not [string]::IsNullOrWhiteSpace($parsed.session_id)) { $parsed.session_id } else { "" }
$seq = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$bodyMap = @{
    terminalId = $env:DEVHUB_TERMINAL_ID
    token = $env:DEVHUB_HOOK_TOKEN
    source = "devhub:$Agent"
    agent = $Agent
    state = $State
    event = $Event
    agentSessionId = $agentSessionId
    seq = $seq
    ts = $seq
}

try {
    $json = $bodyMap | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $env:DEVHUB_HOOK_URL -Method Post -ContentType "application/json" -Body $json -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
} catch {
}
exit 0
