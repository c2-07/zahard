import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const apiUrl = `${baseUrl}/api`;

  const script = `$ErrorActionPreference = 'Stop'

$InstallDir = Join-Path $env:LOCALAPPDATA 'za\\bin'
$ConfigDir = Join-Path $env:APPDATA 'za'
$CookieFile = Join-Path $ConfigDir 'cookie'

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null

$ZaScriptPath = Join-Path $InstallDir 'za.ps1'
$ZaCmdPath = Join-Path $InstallDir 'za.cmd'

$ZaScript = @'
$ErrorActionPreference = 'Stop'

$ApiUrl = '${apiUrl}'
$CookieFile = Join-Path $env:APPDATA 'za\\cookie'
$InstallDir = Join-Path $env:LOCALAPPDATA 'za\\bin'

function Show-Usage {
  Write-Output 'Usage: za [OPTIONS] <PROMPT>'
  Write-Output ''
  Write-Output 'Commands:'
  Write-Output '  login        Log in to your account'
  Write-Output '  uninstall    Remove the CLI from your system'
  Write-Output '  help         Show this usage guide'
  Write-Output ''
  Write-Output 'Options:'
  Write-Output '  -t           Prioritize the Gemini reasoning model'
}

function Uninstall-Za {
  Write-Output "Uninstalling 'za' CLI..."
  Remove-Item -Path (Join-Path $InstallDir 'za.ps1') -Force -ErrorAction SilentlyContinue
  Remove-Item -Path (Join-Path $InstallDir 'za.cmd') -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $CookieFile -Force -ErrorAction SilentlyContinue
  Write-Output 'Uninstalled successfully.'
}

function Save-SessionCookie {
  param([string]$Value)
  $cookieDir = Split-Path $CookieFile -Parent
  New-Item -ItemType Directory -Path $cookieDir -Force | Out-Null
  Set-Content -Path $CookieFile -Value $Value -NoNewline
}

function Load-WebSession {
  if (-not (Test-Path $CookieFile)) {
    throw 'Error: Not logged in. Please run: za login'
  }
  $cookieValue = (Get-Content -Path $CookieFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($cookieValue)) {
    throw 'Error: Empty login session. Please run: za login'
  }
  $apiUri = [System.Uri]$ApiUrl
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $cookie = New-Object System.Net.Cookie('session', $cookieValue, '/', $apiUri.Host)
  $session.Cookies.Add($cookie)
  return $session
}

function Login-Za {
  $username = Read-Host 'Username'
  $securePassword = Read-Host 'Password' -AsSecureString
  $password = [System.Net.NetworkCredential]::new('', $securePassword).Password
  $body = @{ username = $username; password = $password } | ConvertTo-Json -Compress

  try {
    Invoke-WebRequest -Uri "$ApiUrl/auth/login" -Method Post -ContentType 'application/json' -Body $body -SessionVariable session | Out-Null
    $apiUri = [System.Uri]$ApiUrl
    $sessionCookie = $session.Cookies.GetCookies($apiUri) | Where-Object { $_.Name -eq 'session' } | Select-Object -First 1
    if (-not $sessionCookie) {
      throw 'Login failed or no cookie returned from server.'
    }
    Save-SessionCookie -Value $sessionCookie.Value
    Write-Output 'Logged in successfully.'
  } catch {
    Remove-Item -Path $CookieFile -Force -ErrorAction SilentlyContinue
    throw 'Login failed. Network error or incorrect credentials.'
  }
}

$argsList = [System.Collections.Generic.List[string]]::new()
$args | ForEach-Object { [void]$argsList.Add($_) }

if ($argsList.Count -eq 0 -or $argsList[0] -in @('help', '--help', '-h')) {
  Show-Usage
  exit 0
}

if ($argsList[0] -eq 'uninstall') {
  Uninstall-Za
  exit 0
}

if ($argsList[0] -eq 'login') {
  Login-Za
  exit 0
}

$thinking = $false
if ($argsList.Count -gt 0 -and $argsList[0] -eq '-t') {
  $thinking = $true
  $argsList.RemoveAt(0)
}

$prompt = ($argsList -join ' ').Trim()
if ([string]::IsNullOrWhiteSpace($prompt)) {
  throw 'Error: Prompt cannot be empty.'
}

try {
  $session = Load-WebSession
  $payload = @{ prompt = $prompt; thinking = $thinking } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Uri "$ApiUrl/make" -Method Post -ContentType 'application/json' -Body $payload -WebSession $session
  if ($response.text) {
    Write-Output $response.text
  } elseif ($response.error) {
    throw $response.error
  } else {
    Write-Output ($response | ConvertTo-Json -Depth 8)
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
'@

Set-Content -Path $ZaScriptPath -Value $ZaScript -NoNewline
Set-Content -Path $ZaCmdPath -Value '@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0za.ps1" %*' -NoNewline

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) {
  $userPath = ''
}

if ($userPath -notlike "*$InstallDir*") {
  $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $InstallDir } else { "$userPath;$InstallDir" }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Output "Added $InstallDir to your user PATH."
}

$env:Path = "$InstallDir;$env:Path"

Write-Output '----------------------------------------'
Write-Output "Successfully installed 'za' CLI for Windows!"
Write-Output '----------------------------------------'
Write-Output 'If this is a new terminal, restart it before running za.'
Write-Output ''
Write-Output 'Getting started:'
Write-Output '  1. Login: za login'
Write-Output '  2. Ask:   za "Hello world!"'
Write-Output '  3. Help:  za help'
`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
};
