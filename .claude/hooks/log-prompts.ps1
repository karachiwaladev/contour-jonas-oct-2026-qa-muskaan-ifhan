# Stop hook helper: append every user prompt from this session's transcript that
# isn't already logged to .claude/logs/prompts.jsonl, one JSON object per line.
# Reads the Stop hook payload (session_id, transcript_path) from stdin.
$ErrorActionPreference = 'Stop'

$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$transcript = $payload.transcript_path
if (-not $transcript -or -not (Test-Path -LiteralPath $transcript)) { exit 0 }

$projectDir = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { $payload.cwd }
$logDir = Join-Path $projectDir '.claude\logs'
$logFile = Join-Path $logDir 'prompts.jsonl'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# uuids already written, so each stop only appends what's new
$seen = @{}
if (Test-Path -LiteralPath $logFile) {
  foreach ($m in [regex]::Matches([IO.File]::ReadAllText($logFile), '"uuid":"([^"]+)"')) { $seen[$m.Groups[1].Value] = $true }
}

function Get-Text($content) {
  if ($content -is [string]) { return $content }
  if ($content | Where-Object { $_.type -eq 'tool_result' }) { return $null }
  return (($content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n")
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$lines = New-Object System.Collections.Generic.List[string]

foreach ($line in [IO.File]::ReadLines($transcript, $utf8)) {
  if (-not $line.Contains('"uuid"')) { continue }
  try { $e = $line | ConvertFrom-Json } catch { continue }
  if (-not $e.uuid -or $seen.ContainsKey($e.uuid)) { continue }

  # typed prompts are user entries; prompts sent mid-turn arrive as queued_command attachments
  $text = $null
  if ($e.type -eq 'user' -and -not $e.isMeta) { $text = Get-Text $e.message.content }
  elseif ($e.type -eq 'attachment' -and $e.attachment.type -eq 'queued_command') { $text = Get-Text $e.attachment.prompt }
  if (-not $text) { continue }

  # drop IDE/system context the harness injects alongside the prompt
  $text = [regex]::Replace($text, '(?s)<(ide_opened_file|ide_selection|system-reminder)>.*?</\1>', '').Trim()
  if (-not $text) { continue }

  $record = [ordered]@{ timestamp = $e.timestamp; session_id = $payload.session_id; uuid = $e.uuid; prompt = $text }
  $lines.Add(($record | ConvertTo-Json -Compress))
  $seen[$e.uuid] = $true
}

if ($lines.Count -gt 0) { [IO.File]::AppendAllText($logFile, (($lines -join "`n") + "`n"), $utf8) }
