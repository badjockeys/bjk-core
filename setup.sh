#!/usr/bin/env bash
# Bad Jockeys: complete local setup on macOS. Safe to run again; it skips whatever is already done.
#
#   bash setup.sh        (it can be the only file you have; it fetches the repos itself)
#
# It installs any missing tools with Homebrew (installing Homebrew first if needed): GitHub CLI, .NET 10 SDK,
# Node.js 24, Docker Desktop, ffmpeg, VS Code, plus Rosetta on Apple Silicon. It signs you in to GitHub in your
# browser (that sign-in also gives access to the private BJK.Modules packages), clones the four repos into
# ~/Git/GitHub/badjockeys (or next to this bjk-core), runs scripts/setup-local.mjs for the project setup, and opens
# the VS Code workspace. macOS asks for your password for some installs and to trust the HTTPS certificate.
#
# On Linux, install the tools with your package manager (see docs/local-development.md); this script then does the rest.
set -uo pipefail

ORG=badjockeys
REPOS=(bjk-core bjk-identity-server bjk-modules bjk-mobile)

step() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
done_() { printf '\033[32m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$1"; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
node_ok() { has node && [ "$(node --version | sed 's/^v//; s/\..*//')" -ge 24 ]; }
dotnet_ok() { has dotnet && dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; }

# Tools that may be installed but not yet on this shell's PATH.
# Microsoft's .NET install (/usr/local/share/dotnet) goes first: Homebrew's own "dotnet" formula only sees its own SDK.
export PATH="/usr/local/share/dotnet:/opt/homebrew/bin:/usr/local/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

# --- Tools -----------------------------------------------------------------------------------------------------------
step "Checking tools"
if [ "$(uname -s)" = Darwin ]; then
  if ! has brew; then
    echo "Installing Homebrew (it will ask for your password)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || fail "Homebrew didn't install."
  fi
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
  has brew || fail "Homebrew isn't on your PATH. Open a new terminal and run this again."
  if ! grep -qs 'brew shellenv' "$HOME/.zprofile"; then
    echo "eval \"\$($(command -v brew) shellenv)\"" >> "$HOME/.zprofile"
  fi

  install() { # name check-function brew-args...
    local name=$1 check=$2; shift 2
    if $check; then echo "$name: installed"; return; fi
    printf '\033[33m%s: installing...\033[0m\n' "$name"
    brew install "$@" || fail "$name didn't install: brew install $*"
    $check || fail "$name installed, but this terminal still finds an older copy or none. Open a new terminal and run this again; if it repeats, run: which -a ${name%% *}"
    done_ "$name: installed"
  }
  has_gh() { has gh; }
  has_ffmpeg() { has ffmpeg; }
  has_docker() { has docker || [ -d /Applications/Docker.app ]; }
  has_code() { has code || [ -d "/Applications/Visual Studio Code.app" ]; }

  install "GitHub CLI" has_gh gh
  install ".NET 10 SDK" dotnet_ok --cask dotnet-sdk

  # A Homebrew "dotnet" formula (brew install dotnet) puts its own dotnet on the PATH, which only knows its own
  # SDK and hides Microsoft's install. Unlink it (it stays installed; brew link dotnet restores it).
  if brew list --formula dotnet >/dev/null 2>&1 && [ -e "$(brew --prefix)/bin/dotnet" ]; then
    echo "Unlinking Homebrew's dotnet formula, which hides the .NET 10 SDK (brew link dotnet puts it back)."
    brew unlink dotnet >/dev/null
  fi
  # Make sure new terminals (and VS Code) find Microsoft's install first too, even if ~/.zshrc sets PATH itself.
  if [ -x /usr/local/share/dotnet/dotnet ] && ! grep -qs '/usr/local/share/dotnet' "$HOME/.zshrc"; then
    printf '\n# .NET SDK (added by Bad Jockeys setup.sh)\nexport PATH="/usr/local/share/dotnet:$PATH"\n' >> "$HOME/.zshrc"
    echo "Added /usr/local/share/dotnet to your PATH in ~/.zshrc"
  fi
  if ! node_ok; then
    printf '\033[33mNode.js 24: installing...\033[0m\n'
    brew install node@24 && brew link --overwrite --force node@24 || fail "Node.js didn't install: brew install node@24"
    node_ok || fail "Node.js 24 installed but an older node is first on your PATH ($(command -v node)). Remove it or put $(brew --prefix node@24)/bin first."
    done_ "Node.js 24: installed"
  else
    echo "Node.js 24+: installed"
  fi
  install "ffmpeg" has_ffmpeg ffmpeg
  install "Docker Desktop" has_docker --cask docker
  install "VS Code" has_code --cask visual-studio-code

  if [ "$(uname -m)" = arm64 ] && ! /usr/bin/pgrep -q oahd; then
    echo "Installing Rosetta (SQL Server only runs on x86-64)..."
    softwareupdate --install-rosetta --agree-to-license || fail "Rosetta didn't install: softwareupdate --install-rosetta"
  fi
else
  missing=()
  for t in git gh dotnet node docker ffmpeg; do has "$t" || missing+=("$t"); done
  dotnet_ok || missing+=(".NET 10 SDK")
  node_ok || missing+=("Node.js 24+")
  [ ${#missing[@]} -eq 0 ] || fail "Install these with your package manager, then run this again: ${missing[*]}"
  echo "All tools installed"
fi

# --- Docker ----------------------------------------------------------------------------------------------------------
step "Starting Docker Desktop"
if ! docker info >/dev/null 2>&1; then
  [ "$(uname -s)" = Darwin ] && open -a Docker
  echo "Waiting for Docker. The first time, accept the terms in the Docker Desktop window (you can skip signing in)."
  for _ in $(seq 1 60); do
    sleep 5
    docker info >/dev/null 2>&1 && break
    printf '.'
  done
  echo
  docker info >/dev/null 2>&1 || fail "Docker didn't start. Open Docker Desktop, wait until it says it's running, then run this again."
fi
done_ "Docker is running"

# --- GitHub ----------------------------------------------------------------------------------------------------------
step "Signing in to GitHub"
if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "Your browser will open: sign in to GitHub and enter the code shown here."
  gh auth login -h github.com --web --git-protocol https --scopes read:packages || fail "GitHub sign-in didn't finish. Run this again to retry."
elif ! gh auth status -h github.com 2>&1 | grep -q 'read:packages'; then
  echo "Adding package access (read:packages) to your GitHub sign-in; your browser will open."
  gh auth refresh -h github.com --scopes read:packages || fail "GitHub sign-in didn't finish. Run this again to retry."
fi
gh auth setup-git -h github.com >/dev/null
done_ "Signed in to GitHub as $(gh api user --jq .login)"

# --- Repos -----------------------------------------------------------------------------------------------------------
step "Getting the code"
here="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$here/scripts/setup-local.mjs" ]; then
  root="$(dirname "$here")"            # this file is in a bjk-core clone: use its folder
else
  root="$HOME/Git/GitHub/badjockeys"
fi
mkdir -p "$root"
for repo in "${REPOS[@]}"; do
  if [ -d "$root/$repo/.git" ]; then echo "$repo: already cloned"; continue; fi
  gh repo clone "$ORG/$repo" "$root/$repo" || fail "Couldn't clone $ORG/$repo. Check that your GitHub account has access to the $ORG organisation."
  done_ "$repo: cloned"
done
core="$root/bjk-core"

# --- Project setup ---------------------------------------------------------------------------------------------------
step "Setting up the project"
(cd "$core" && node scripts/setup-local.mjs) || exit $?

step "Opening VS Code"
code_cli="$(command -v code || echo "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")"
[ -x "$code_cli" ] && "$code_cli" "$core/badjockeys.code-workspace" || echo "Open $core/badjockeys.code-workspace in VS Code."
printf '\n\033[1;32mAll done.\033[0m In VS Code: Terminal > Run Task... > "Run Bad Jockeys", then open http://localhost:3000\n'
echo "The code is in $root"
