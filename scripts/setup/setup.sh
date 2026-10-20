#!/usr/bin/env bash
# Bad Jockeys: complete local setup on macOS. Safe to run again; it skips whatever is already done.
#
#   bash scripts/setup/setup.sh             (from bjk-core; or on its own: it fetches the repos itself)
#   bash scripts/setup/setup.sh --upgrade   also upgrades the tools to their latest versions (restarts Docker Desktop)
#
# Run it again any time: it pulls the latest code into each repo that's on master with no uncommitted
# changes (others are left alone), and restarts itself if that brought a newer setup.sh.
#
# It installs any missing tools with Homebrew (installing Homebrew first if needed): GitHub CLI, .NET 10 SDK,
# Node.js 24, Docker Desktop, ffmpeg, VS Code, plus Rosetta on Apple Silicon. It signs you in to GitHub in your
# browser (that sign-in also gives access to the private BJK.Modules packages), clones the four repos into
# ~/Git/GitHub/badjockeys (or next to this bjk-core), runs scripts/setup-local.mjs for the project setup, and opens
# the VS Code workspace. macOS asks for your password for some installs and to trust the HTTPS certificate.
#
# On Linux, install the tools with your package manager (see docs/local-development.md); this script then does the rest.
set -uo pipefail

# Fingerprint of this script as it started, to spot a newer one after the repos are updated.
SELF_SUM="$(cksum < "$0")"

UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --upgrade) UPGRADE=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) printf 'Unknown option: %s (try --help)\n' "$arg"; exit 1 ;;
  esac
done

ORG=badjockeys
REPOS=(bjk-core bjk-identity-server bjk-modules bjk-mobile)
PACKAGE=BJK.Modules.Media

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
  # The Docker Desktop app itself; a docker command on its own (Homebrew's docker formula, minikube) isn't
  # enough, unless some other Docker engine is already running and answering.
  has_docker() { [ -d /Applications/Docker.app ] || docker info >/dev/null 2>&1; }
  # The app itself: a "code" command can belong to another editor (Cursor installs one), so it doesn't count.
  has_code() { [ -d "/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Applications/Visual Studio Code.app" ]; }

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
  # --force: Homebrew's docker formula (CLI only) owns /opt/homebrew/bin/docker, which would block the app's links.
  install "Docker Desktop" has_docker --cask --force docker
  install "VS Code" has_code --cask visual-studio-code

  if [ "$UPGRADE" = 1 ]; then
    step "Upgrading the tools (--upgrade)"
    brew update
    for f in gh node@24 ffmpeg; do
      brew list --formula "$f" >/dev/null 2>&1 && { brew upgrade "$f" || echo "Couldn't upgrade $f; carrying on."; }
    done
    for c in dotnet-sdk docker visual-studio-code; do
      brew list --cask "$c" >/dev/null 2>&1 && { brew upgrade --cask "$c" || echo "Couldn't upgrade $c; carrying on."; }
    done
    echo "Tools installed some other way (not with Homebrew) were left as they are."
  fi

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
  [ "$UPGRADE" = 1 ] && echo "On Linux, upgrade the tools with your package manager; --upgrade only covers macOS."
fi

# --- Docker ----------------------------------------------------------------------------------------------------------
step "Starting Docker Desktop"
if ! docker info >/dev/null 2>&1; then
  if [ "$(uname -s)" = Darwin ]; then
    open -a Docker || fail "Couldn't open Docker Desktop. Install it (brew install --cask --force docker) and run this again."
  fi
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
login="$(gh api user --jq .login)"
done_ "Signed in to GitHub as $login"

step "Checking your access to the Bad Jockeys repos and packages"
no_access=()
for repo in "${REPOS[@]}"; do
  gh api "repos/$ORG/$repo" --silent >/dev/null 2>&1 || no_access+=("repo $ORG/$repo")
done
# The private BJK.Modules NuGet packages (GitHub Packages); one stands in for all of them.
gh api "orgs/$ORG/packages/nuget/$PACKAGE" --silent >/dev/null 2>&1 || no_access+=("package $PACKAGE (the BJK.Modules NuGet packages)")
if [ ${#no_access[@]} -gt 0 ]; then
  printf '\n\033[1;31mYour GitHub account %s can'"'"'t see:\033[0m\n' "$login"
  printf '  - %s\n' "${no_access[@]}"
  cat <<MSG

Ask an owner of the $ORG organisation on GitHub to:
  1. invite $login to the organisation (it then has to be accepted, from the email or github.com/$ORG), and
  2. give $login (or a team $login is in) access to all four repos, bjk-modules included, since the packages
     come with it. If the package still isn't visible: org > Packages > $PACKAGE > Package settings > Manage access.
Then run this script again.
MSG
  exit 1
fi
done_ "You can see all four repos and the packages"

# --- Repos -----------------------------------------------------------------------------------------------------------
step "Getting the code"
here="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$here/../setup-local.mjs" ]; then
  root="$(cd "$here/../../.." && pwd)"   # this file is in a bjk-core clone (bjk-core/scripts/setup): use the folder around it
else
  root="$HOME/Git/GitHub/badjockeys"
fi
mkdir -p "$root"
# Pulls the latest master, but only when that can't disturb anyone's work: on master, nothing uncommitted.
update_repo() { # repo path
  local repo=$1 path=$2 branch
  if ! git -C "$path" rev-parse -q --verify HEAD >/dev/null; then echo "$repo: no commits yet"; return; fi
  branch="$(git -C "$path" branch --show-current)"
  if [ "$branch" != master ]; then
    printf '\033[33m%s: on branch %s, so not updated (switch to master to get the latest)\033[0m\n' "$repo" "${branch:-(detached)}"
  elif [ -n "$(git -C "$path" status --porcelain)" ]; then
    printf '\033[33m%s: has uncommitted changes, so not updated\033[0m\n' "$repo"
  elif git -C "$path" pull --ff-only -q; then
    echo "$repo: up to date ($(git -C "$path" log --oneline -1))"
  else
    printf '\033[33m%s: couldn'"'"'t pull the latest master; carrying on with what you have\033[0m\n' "$repo"
  fi
}

for repo in "${REPOS[@]}"; do
  if [ -d "$root/$repo/.git" ]; then update_repo "$repo" "$root/$repo"; continue; fi
  gh repo clone "$ORG/$repo" "$root/$repo" || fail "Couldn't clone $ORG/$repo. Check that your GitHub account has access to the $ORG organisation."
  done_ "$repo: cloned"
done
core="$root/bjk-core"

# If bjk-core now has a different setup.sh than the one running (it was just updated, or this copy was a
# download), carry on with that one so the latest steps run. Once only.
if [ -z "${BJK_SETUP_RESTARTED:-}" ] && [ -f "$core/scripts/setup/setup.sh" ] && [ "$(cksum < "$core/scripts/setup/setup.sh")" != "$SELF_SUM" ]; then
  echo "Restarting with the latest setup.sh from bjk-core..."
  BJK_SETUP_RESTARTED=1 exec bash "$core/scripts/setup/setup.sh" "$@"
fi

# --- Project setup ---------------------------------------------------------------------------------------------------
step "Setting up the project"
(cd "$core" && node scripts/setup-local.mjs) || exit $?

step "Opening VS Code"
# Open VS Code by name rather than through the "code" command, which another editor (Cursor) may have taken over.
if [ "$(uname -s)" = Darwin ]; then
  open -a "Visual Studio Code" "$core/badjockeys.code-workspace" 2>/dev/null \
    || echo "Open $core/badjockeys.code-workspace in VS Code (File > Open Workspace from File...)."
elif has code; then
  code "$core/badjockeys.code-workspace"
else
  echo "Open $core/badjockeys.code-workspace in VS Code (File > Open Workspace from File...)."
fi
printf '\n\033[1;32mAll done.\033[0m In VS Code: Terminal > Run Task... > "Run Bad Jockeys", then open http://localhost:3000\n'
echo "The code is in $root"
