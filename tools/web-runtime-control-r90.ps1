param(
  [ValidateSet('Status','Stop')]
  [string]$Action = 'Status',
  [string]$Root = ''
)
$ErrorActionPreference = 'Stop'

# R83: do not depend on cmd.exe's quoted trailing-backslash transport.
# When -Root is omitted, derive it from this script: <root>\tools\this.ps1.
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

# PowerShell backslash is NOT an escape character.  Previous R45.1 used
# The previous release passed multi-character string literals into System.Char overloads,
# which throws MethodArgumentConversionInvalidCastArgument on Windows PowerShell.
$Root = $Root.Trim()
$Root = $Root.Trim([char[]]@([char]34)) # quote
if ([string]::IsNullOrWhiteSpace($Root)) { throw 'Root vazio depois da normalizacao.' }
$Root = [System.IO.Path]::GetFullPath($Root)
$pathRoot = [System.IO.Path]::GetPathRoot($Root)
if ($Root.Length -gt $pathRoot.Length) {
  $Root = $Root.TrimEnd([char[]]@([char]92,[char]47)) # backslash + slash
}

function Norm([string]$s) { if ($null -eq $s) { return '' }; return $s.Replace('/','\').ToLowerInvariant() }
$rootN = Norm $Root
$ownedScripts = @(
  (Norm (Join-Path $Root 'tools\dev-web-server.cjs')),
  (Norm (Join-Path $Root 'tools\asset-server.cjs')),
  (Norm (Join-Path $Root 'gateway-server.cjs')),
  (Norm (Join-Path $Root 'tools\start-r90-safe.cjs')),
  (Norm (Join-Path $Root 'tools\start-r90-fix17-safe.cjs')),
  (Norm (Join-Path $Root 'tools\start-r90-fix18-safe.cjs')),
  (Norm (Join-Path $Root 'tools\start-r90-fix19-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix20-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix21-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix22-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix23-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix24-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix25-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix26-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix27-safe.cjs'))
  (Norm (Join-Path $Root 'tools\start-r90-fix28-safe.cjs'))
)
function Is-OwnedProcess($p) {
  if ($p.Name -notmatch '^node(\.exe)?$') { return $false }
  $cmd = Norm $p.CommandLine
  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }
  foreach ($s in $ownedScripts) {
    # Exact command-line argument: rejects paths with a suffix or quoted JS snippets.
    $pattern = '(?:^|\s)(?:"' + [regex]::Escape($s) + '"(?=\s|$)|' + [regex]::Escape($s) + '(?=\s|$))'
    if ([regex]::IsMatch($cmd, $pattern)) { return $true }
  }
  return $false
}
function Owned-Processes {
  @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { Is-OwnedProcess $_ })
}
function Test-TcpPort([int]$Port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect('127.0.0.1',$Port,$null,$null)
    if (-not $iar.AsyncWaitHandle.WaitOne(250,$false)) { return $false }
    $c.EndConnect($iar); return $true
  } catch { return $false } finally { try { $c.Close() } catch {} }
}
function Show-Status {
  Write-Host '================================================================'
  Write-Host ' MUWEB R90 - STATUS DOS SERVIDORES DA WEB'
  Write-Host '================================================================'
  Write-Host ('Root: ' + $Root)
  $ps = Owned-Processes
  if ($ps.Count -eq 0) { Write-Host '[WEB] Nenhum processo Node desta raiz encontrado.' }
  else {
    foreach ($p in $ps) { Write-Host (('[WEB] PID {0}  {1}' -f $p.ProcessId,$p.CommandLine)) }
  }
  $httpPort = 0
  $hp = Join-Path $Root '.muweb-http-port'
  if (Test-Path -LiteralPath $hp) { [void][int]::TryParse((Get-Content -LiteralPath $hp -Raw).Trim(), [ref]$httpPort) }
  if ($httpPort -gt 0) { Write-Host (('[HTTP] 127.0.0.1:{0} = {1}' -f $httpPort, $(if(Test-TcpPort $httpPort){'ONLINE'}else{'OFFLINE'}))) }
  else { Write-Host '[HTTP] porta desta raiz ainda nao registrada.' }
  Write-Host (('[GATEWAY] 9091 = {0}' -f $(if(Test-TcpPort 9091){'ONLINE'}else{'OFFLINE'})))
  Write-Host (('[GATEWAY-ADMIN] 9090 = {0}' -f $(if(Test-TcpPort 9090){'ONLINE'}else{'OFFLINE'})))
  $assets = @(); foreach($p in 9100..9110){ if(Test-TcpPort $p){$assets += $p} }
  if($assets.Count){ Write-Host ('[ASSETS] ONLINE: ' + ($assets -join ', ')) } else { Write-Host '[ASSETS] nenhuma porta 9100..9110 respondeu.' }
}
if ($Action -eq 'Status') { Show-Status; exit 0 }
Write-Host '================================================================'
Write-Host ' MUWEB R90 - DESLIGANDO SOMENTE OS SERVIDORES DESTA WEB'
Write-Host '================================================================'
$ps = Owned-Processes
if ($ps.Count -eq 0) { Write-Host '[OK] Nenhum processo desta raiz precisava ser encerrado.' }
else {
  foreach ($p in $ps | Sort-Object ProcessId -Descending) {
    try {
      Write-Host (('[STOP] PID {0}' -f $p.ProcessId))
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    } catch { Write-Warning (('Falha ao encerrar PID {0}: {1}' -f $p.ProcessId,$_.Exception.Message)) }
  }
  Start-Sleep -Milliseconds 450
}
Remove-Item -LiteralPath (Join-Path $Root '.muweb-http-port') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $Root '.muweb-http-url') -Force -ErrorAction SilentlyContinue
if ((Owned-Processes).Count -gt 0) { Write-Error 'Ainda existem processos desta source ativos.'; exit 1 }
Write-Host '[OK] Stop concluido. Servidores MU externos (GameServer/ConnectServer/DataServer) NAO foram tocados.'
Show-Status
