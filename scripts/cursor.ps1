param(
  [Parameter(Mandatory = $true)][string]$Cmd
)

Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
public struct POINT { public int X; public int Y; }
[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@ -Name Cursor -Namespace Perch

# 用法:
#   cursor.ps1 "set 1424 -69"   绝对定位（物理像素，可为负）
#   cursor.ps1 "get"            读取当前位置
#   cursor.ps1 "move 60 40"     注入相对移动（与真实鼠标移动等价，可为负）
#   cursor.ps1 "setget x y"     绝对定位后立即读回
$parts = $Cmd -split '\s+' | Where-Object { $_ -ne '' }
switch ($parts[0]) {
  'set' {
    [Perch.Cursor]::SetCursorPos([int]$parts[1], [int]$parts[2]) | Out-Null
  }
  'get' {
    $p = New-Object Perch.Cursor+POINT
    [Perch.Cursor]::GetCursorPos([ref]$p) | Out-Null
    Write-Output "$($p.X),$($p.Y)"
  }
  'move' {
    # MOUSEEVENTF_MOVE = 0x0001，相对移动（与物理鼠标移动等效）
    [Perch.Cursor]::mouse_event(0x0001, [int]$parts[1], [int]$parts[2], 0, 0)
  }
  'setget' {
    [Perch.Cursor]::SetCursorPos([int]$parts[1], [int]$parts[2]) | Out-Null
    Start-Sleep -Milliseconds 30
    $p = New-Object Perch.Cursor+POINT
    [Perch.Cursor]::GetCursorPos([ref]$p) | Out-Null
    Write-Output "$($p.X),$($p.Y)"
  }
}
