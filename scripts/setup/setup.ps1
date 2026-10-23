<#
  Bad Jockeys: complete local setup on Windows 10 or 11. Safe to run again; it skips whatever is already done.

  Run it from PowerShell (it can be the only file you have; it fetches the repos itself):
      powershell -ExecutionPolicy Bypass -File scripts\setup\setup.ps1
      powershell -ExecutionPolicy Bypass -File scripts\setup\setup.ps1 -Upgrade    (also upgrades the tools; restarts Docker Desktop)

  Run it again any time: it pulls the latest code into each repo that's on master with no uncommitted changes
  (others are left alone), and restarts itself if that brought a newer setup.ps1.

  It installs any missing tools with winget (Git, GitHub CLI, .NET 10 SDK, Node.js LTS, Docker Desktop, ffmpeg,
  Ollama for Ask Bad Jockeys, VS Code), turns on WSL 2 for Docker, signs you in to GitHub in your browser (that sign-in also gives access to the
  private BJK.Modules packages), clones the four repos into %USERPROFILE%\Git\badjockeys (or next to this bjk-core),
  runs scripts\setup-local.mjs for the project setup, and opens the VS Code workspace.

  Windows will ask for permission (UAC) for some installs, and once to trust the HTTPS development certificate.
  If WSL 2 has to be switched on, restart when asked and run this again.
#>
param([switch]$Upgrade)
# Fingerprint of this script as it started, to spot a newer one after the repos are updated.
$SelfHash = if ($PSCommandPath) { (Get-FileHash $PSCommandPath).Hash } else { '' }
$ErrorActionPreference = 'Continue'   # native commands report through $LASTEXITCODE; Stop breaks on their stderr in PowerShell 5.1
$Org = 'badjockeys'
$Repos = @('bjk-core', 'bjk-identity-server', 'bjk-modules', 'bjk-mobile')
$Package = 'BJK.Modules.Media'   # stands in for the private BJK.Modules NuGet packages

function Step([string]$Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }
function Done([string]$Text) { Write-Host $Text -ForegroundColor Green }
function Fail([string]$Text) { Write-Host "`n$Text" -ForegroundColor Red; exit 1 }
function Has([string]$Command) { [bool](Get-Command $Command -ErrorAction SilentlyContinue) }
# VS Code itself, by its install location: a "code" command can belong to another editor (Cursor installs one).
function Find-VSCode {
    foreach ($exe in @("$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe", "$env:ProgramFiles\Microsoft VS Code\Code.exe")) {
        if (Test-Path $exe) { return $exe }
    }
    return $null
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    foreach ($extra in @("$env:ProgramFiles\Docker\Docker\resources\bin", "$env:ProgramFiles\GitHub CLI", "$env:ProgramFiles\dotnet", "$env:LOCALAPPDATA\Programs\Ollama")) {
        if ((Test-Path $extra) -and ($env:Path -notlike "*$extra*")) { $env:Path += ";$extra" }
    }
}

# --- Tools -----------------------------------------------------------------------------------------------------------
Step 'Checking tools'
if (-not (Has 'winget')) { Fail 'winget is missing. Install "App Installer" from the Microsoft Store, then run this again.' }
Refresh-Path

$tools = @(
    @{ Name = 'Git'; Id = 'Git.Git'; Check = { Has 'git' } },
    @{ Name = 'GitHub CLI'; Id = 'GitHub.cli'; Check = { Has 'gh' } },
    @{ Name = '.NET 10 SDK'; Id = 'Microsoft.DotNet.SDK.10'; Check = { (Has 'dotnet') -and [bool]((dotnet --list-sdks) -match '^10\.') } },
    @{ Name = 'Node.js 24+'; Id = 'OpenJS.NodeJS.LTS'; Check = { (Has 'node') -and ([int]((node --version).TrimStart('v').Split('.')[0]) -ge 24) } },
    @{ Name = 'Docker Desktop'; Id = 'Docker.DockerDesktop'; Check = { (Has 'docker') -or (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe") } },
    @{ Name = 'ffmpeg'; Id = 'Gyan.FFmpeg'; Check = { Has 'ffmpeg' } },
    # Ask Bad Jockeys' model server: it starts with Windows and runs in the tray. setup-local.mjs downloads the model.
    @{ Name = 'Ollama'; Id = 'Ollama.Ollama'; Check = { (Has 'ollama') -or (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe") } },
    @{ Name = 'VS Code'; Id = 'Microsoft.VisualStudioCode'; Check = { [bool](Find-VSCode) } }
)
foreach ($tool in $tools) {
    if (& $tool.Check) { Write-Host "$($tool.Name): installed"; continue }
    Write-Host "$($tool.Name): installing..." -ForegroundColor Yellow
    winget install --id $tool.Id --exact --silent --accept-source-agreements --accept-package-agreements
    Refresh-Path
    if (-not (& $tool.Check)) {
        Fail "$($tool.Name) didn't install (winget exit code $LASTEXITCODE). Close this window, open a new PowerShell and run the script again; if it still fails, install it by hand: winget install --id $($tool.Id)"
    }
    Done "$($tool.Name): installed"
}

if ($Upgrade) {
    Step 'Upgrading the tools (-Upgrade)'
    foreach ($tool in $tools) {
        Write-Host "$($tool.Name)..."
        winget upgrade --id $tool.Id --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host
    }
    Refresh-Path
    Write-Host 'Tools installed some other way (not with winget) were left as they are.'
}

# --- WSL 2 and Docker ------------------------------------------------------------------------------------------------
Step 'Checking WSL 2 (Docker Desktop runs on it)'
wsl.exe --status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Turning on WSL 2. Windows will ask for permission.' -ForegroundColor Yellow
    Start-Process -FilePath 'wsl.exe' -ArgumentList '--install', '--no-distribution' -Verb RunAs -Wait
    Write-Host "`nRestart Windows, then run this script again. It carries on from here." -ForegroundColor Yellow
    exit 0
}
Done 'WSL 2 is on'

Step 'Starting Docker Desktop'
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) { Start-Process -FilePath $dockerExe }
    Write-Host 'Waiting for Docker. The first time, accept the terms in the Docker Desktop window (you can skip signing in).'
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Write-Host -NoNewline '.'
    }
    Write-Host ''
    if ($LASTEXITCODE -ne 0) {
        Fail "Docker Desktop didn't start. Open it from the Start menu and wait until it says it's running, then run this again. If it says you're not in the docker-users group, sign out of Windows and back in."
    }
}
Done 'Docker is running'

# --- GitHub ----------------------------------------------------------------------------------------------------------
Step 'Signing in to GitHub'
gh auth status -h github.com *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Your browser will open: sign in to GitHub and enter the code shown here.'
    gh auth login -h github.com --web --git-protocol https --scopes read:packages
    if ($LASTEXITCODE -ne 0) { Fail 'GitHub sign-in did not finish. Run this script again to retry.' }
} else {
    $status = gh auth status -h github.com 2>&1 | Out-String
    if ($status -notmatch 'read:packages') {
        Write-Host 'Adding package access (read:packages) to your GitHub sign-in; your browser will open.'
        gh auth refresh -h github.com --scopes read:packages
        if ($LASTEXITCODE -ne 0) { Fail 'GitHub sign-in did not finish. Run this script again to retry.' }
    }
}
gh auth setup-git -h github.com | Out-Null
$login = gh api user --jq .login
Done "Signed in to GitHub as $login"

Step 'Checking your access to the Bad Jockeys repos and packages'
$noAccess = @()
foreach ($repo in $Repos) {
    gh api "repos/$Org/$repo" --silent *> $null
    if ($LASTEXITCODE -ne 0) { $noAccess += "repo $Org/$repo" }
}
# The private BJK.Modules NuGet packages (GitHub Packages); one stands in for all of them.
gh api "orgs/$Org/packages/nuget/$Package" --silent *> $null
if ($LASTEXITCODE -ne 0) { $noAccess += "package $Package (the BJK.Modules NuGet packages)" }
if ($noAccess.Count -gt 0) {
    Write-Host "`nYour GitHub account $login can't see:" -ForegroundColor Red
    foreach ($item in $noAccess) { Write-Host "  - $item" }
    Write-Host @"

Ask an owner of the $Org organisation on GitHub to:
  1. invite $login to the organisation (it then has to be accepted, from the email or github.com/$Org), and
  2. give $login (or a team $login is in) access to all four repos, bjk-modules included, since the packages
     come with it. If the package still isn't visible: org > Packages > $Package > Package settings > Manage access.
Then run this script again.
"@
    exit 1
}
Done 'You can see all four repos and the packages'

# --- Repos -----------------------------------------------------------------------------------------------------------
Step 'Getting the code'
if ($PSScriptRoot -and (Test-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'setup-local.mjs'))) {
    $root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent   # in a bjk-core clone (bjk-core\scripts\setup): use the folder around it
} else {
    $root = Join-Path $HOME 'Git\badjockeys'
}
New-Item -ItemType Directory -Force -Path $root | Out-Null
# Pulls the latest master, but only when that can't disturb anyone's work: on master, nothing uncommitted.
function Update-Repo([string]$Repo, [string]$Path) {
    git -C $Path rev-parse -q --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) { Write-Host "${Repo}: no commits yet"; return }
    $branch = git -C $Path branch --show-current
    if ($branch -ne 'master') {
        if (-not $branch) { $branch = '(detached)' }
        Write-Host "${Repo}: on branch $branch, so not updated (switch to master to get the latest)" -ForegroundColor Yellow
    } elseif (git -C $Path status --porcelain) {
        Write-Host "${Repo}: has uncommitted changes, so not updated" -ForegroundColor Yellow
    } else {
        git -C $Path pull --ff-only -q
        if ($LASTEXITCODE -eq 0) { Write-Host "${Repo}: up to date ($(git -C $Path log --oneline -1))" }
        else { Write-Host "${Repo}: couldn't pull the latest master; carrying on with what you have" -ForegroundColor Yellow }
    }
}

foreach ($repo in $Repos) {
    $path = Join-Path $root $repo
    if (Test-Path (Join-Path $path '.git')) { Update-Repo $repo $path; continue }
    gh repo clone "$Org/$repo" $path
    if ($LASTEXITCODE -ne 0) { Fail "Couldn't clone $Org/$repo. Check that your GitHub account has access to the $Org organisation." }
    Done "${repo}: cloned"
}
$core = Join-Path $root 'bjk-core'

# If bjk-core now has a different setup.ps1 than the one running (it was just updated, or this copy was a
# download), carry on with that one so the latest steps run. Once only.
$latest = Join-Path $core 'scripts\setup\setup.ps1'
if (-not $env:BJK_SETUP_RESTARTED -and (Test-Path $latest) -and ((Get-FileHash $latest).Hash -ne $SelfHash)) {
    Write-Host 'Restarting with the latest setup.ps1 from bjk-core...'
    $env:BJK_SETUP_RESTARTED = '1'
    $passOn = @('-ExecutionPolicy', 'Bypass', '-File', $latest)
    if ($Upgrade) { $passOn += '-Upgrade' }
    & powershell.exe @passOn
    exit $LASTEXITCODE
}

# --- Project setup ---------------------------------------------------------------------------------------------------
Step 'Setting up the project'
Push-Location $core
node scripts\setup-local.mjs
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { exit $code }

Step 'Opening VS Code'
$workspace = Join-Path $core 'badjockeys.code-workspace'
$vscode = Find-VSCode
if ($vscode) { Start-Process -FilePath $vscode -ArgumentList "`"$workspace`"" }
else { Write-Host "Open $workspace in VS Code (File > Open Workspace from File...)." }
Write-Host "`nAll done. In VS Code: Terminal > Run Task... > ""Run Bad Jockeys"", then open http://localhost:3000" -ForegroundColor Green
Write-Host "The code is in $root"
