param([switch]$Resume, [switch]$CheckOnly, [switch]$CheckLibraryLaunch)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$runtimeDir = Join-Path $env:LOCALAPPDATA 'PaperLantern/runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$pausePath = Join-Path $runtimeDir 'paused'
$restartPath = Join-Path $runtimeDir 'restart'
if ($Resume -and (Test-Path -LiteralPath $pausePath)) { Remove-Item -LiteralPath $pausePath }
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\PaperLanternTray-$sid", [ref]$created)
if (!$created) { $mutex.Dispose(); exit }
$icon = New-Object System.Windows.Forms.NotifyIcon
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$timer = New-Object System.Windows.Forms.Timer
try {
  # Draw a small lantern locally; no downloaded assets or extra dependencies.
  $bitmap = New-Object System.Drawing.Bitmap(32,32)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = 'AntiAlias'
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(36,56,79))
  $graphics.FillEllipse($brush,1,1,30,30)
  $graphics.FillRectangle([System.Drawing.Brushes]::White,10,8,12,17)
  $graphics.DrawLine([System.Drawing.Pens]::Gold,13,5,19,5)
  $graphics.DrawLine([System.Drawing.Pens]::Gold,13,27,19,27)
  $nativeIcon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
  $icon.Icon = $nativeIcon
  $icon.Text = 'Paper Lantern - Ready'
  $statusItem = $menu.Items.Add('연결 대기 중'); $statusItem.Enabled = $false
  $libraryItem = $menu.Items.Add('라이브러리 열기')
  $libraryItem.Tag = Join-Path $PSScriptRoot 'library.ps1'
  $libraryItem.add_Click({
    param($sender,$eventArgs)
    try {
      $libraryScript = [string]$sender.Tag
      if (!(Test-Path -LiteralPath $libraryScript)) { throw '라이브러리 실행 파일이 없습니다. 연결 프로그램을 다시 설치해 주세요.' }
      Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ('-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $libraryScript + '"') -WindowStyle Hidden
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Paper Lantern','OK','Error') | Out-Null }
  })
  $details = $menu.Items.Add('상태 보기')
  $restart = $menu.Items.Add('Codex 서버 재시작')
  $null = $menu.Items.Add('-')
  $quit = $menu.Items.Add('연결 프로그램 종료')
  $details.add_Click({
    $lines = @('Paper Lantern 연결 프로그램', '', 'Chrome에서 PDF를 열면 Codex 서버에 연결합니다.')
    $records = @(Get-ChildItem -LiteralPath $runtimeDir -Filter 'host-*.json' | ForEach-Object { try { $r = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json; if (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $r.updatedAt) -lt 5000) { $r } } catch {} })
    foreach ($record in $records) { $lines += "PID $($record.pid) | $($record.state) | 모델 $($record.models)개 | 요청 $($record.active)개" }
    if (!$records.Count) { $lines += '현재 연결된 Chrome 서버가 없습니다.' }
    $lines += ''; $lines += '연결이 안 되면 리더 설정에서 모델 목록 다시 불러오기를 누르세요.'
    [System.Windows.Forms.MessageBox]::Show(($lines -join "`r`n"), 'Paper Lantern', 'OK', 'Information') | Out-Null
  })
  $restart.add_Click({
    [IO.File]::WriteAllText($restartPath, [Guid]::NewGuid().ToString())
    $icon.ShowBalloonTip(3000, 'Paper Lantern', '서버를 정리합니다. 리더 설정에서 모델 목록 다시 불러오기를 눌러 주세요.', [System.Windows.Forms.ToolTipIcon]::Info)
  })
  $quit.add_Click({
    [IO.File]::WriteAllText($pausePath, 'paused')
    [System.Windows.Forms.Application]::ExitThread()
  })
  $icon.Tag = $libraryItem
  $icon.add_DoubleClick({ param($sender,$eventArgs); if($sender.Tag){$sender.Tag.PerformClick()} })
  $icon.ContextMenuStrip = $menu
  $timer.Interval = 1500
  $timer.add_Tick({
    $records = @(Get-ChildItem -LiteralPath $runtimeDir -Filter 'host-*.json' | ForEach-Object { try { $r = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json; if (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $r.updatedAt) -lt 5000) { $r } } catch {} })
    $ready = @($records | Where-Object state -eq 'ready').Count
    $statusItem.Text = if ($ready) { "연결됨 · 서버 $ready 개" } elseif ($records.Count) { '연결 확인 필요 · 상태 보기' } else { '연결 대기 중' }
    $icon.Text = "Paper Lantern - $ready connected"
  })
  if ($CheckLibraryLaunch) { $libraryItem.PerformClick() }
  if (!$CheckOnly) { $icon.Visible = $true; $timer.Start(); [System.Windows.Forms.Application]::Run() }
} finally {
  $timer.Stop(); $timer.Dispose(); $icon.Visible = $false; $icon.Dispose(); $menu.Dispose()
  if ($graphics) { $graphics.Dispose(); $brush.Dispose(); $nativeIcon.Dispose(); $bitmap.Dispose() }
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
