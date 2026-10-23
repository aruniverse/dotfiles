#!/usr/bin/env bash
set -euo pipefail

# dotfiles installer — idempotent, backs up existing files
# Works regardless of clone location.

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
BACKUP_DIR="$HOME/.dotfiles-backups/$(date +%Y%m%d-%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[dotfiles]${NC} $*"; }
warn() { echo -e "${YELLOW}[dotfiles]${NC} $*"; }
abort() { echo -e "${RED}[dotfiles]${NC} $*"; exit 1; }

backup_existing() {
  local target="$1"
  if [[ -e "$target" && ! -L "$target" ]]; then
    mkdir -p "$BACKUP_DIR"
    cp -R "$target" "$BACKUP_DIR/"
    warn "Backed up $target -> $BACKUP_DIR"
  fi
}

link_dotfile() {
  local src="$1"
  local dst="$2"

  if [[ -L "$dst" ]]; then
    local current
    current="$(readlink "$dst" 2>/dev/null || true)"
    if [[ "$current" == "$src" ]]; then
      return 0
    fi
  fi

  backup_existing "$dst"
  rm -rf "$dst"
  ln -s "$src" "$dst"
  info "Linked $dst -> $src"
}

ensure_dir() {
  mkdir -p "$1"
}

# Detect OS
OS="unknown"
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
esac
info "Detected OS: $OS"

# ── Shell environment ──────────────────────────────────────────────
info "Installing shell environment..."
ensure_dir "$CONFIG_HOME"

# Source env.sh from shell rc files
SHELL_RC=""
if [[ -n "${ZSH_VERSION:-}" || "$SHELL" == *zsh* ]]; then
  SHELL_RC="$HOME/.zshrc"
elif [[ -n "${BASH_VERSION:-}" || "$SHELL" == *bash* ]]; then
  SHELL_RC="$HOME/.bashrc"
fi

if [[ -n "$SHELL_RC" && -f "$SHELL_RC" ]]; then
  if ! grep -q "dotfiles/config/shell/env.sh" "$SHELL_RC" 2>/dev/null; then
    cat >> "$SHELL_RC" <<EOF

# dotfiles environment (managed by ${DOTFILES_DIR})
[ -f "${DOTFILES_DIR}/config/shell/env.sh" ] && source "${DOTFILES_DIR}/config/shell/env.sh"
EOF
    info "Appended dotfiles source to \$SHELL_RC"
  else
    info "\$SHELL_RC already sources dotfiles"
  fi
fi

# ── Rex ────────────────────────────────────────────────────────────
info "Installing Rex config..."
ensure_dir "$CONFIG_HOME/rex"
link_dotfile "$DOTFILES_DIR/config/rex/init.lua"          "$CONFIG_HOME/rex/init.lua"
link_dotfile "$DOTFILES_DIR/config/rex/keys.lua"          "$CONFIG_HOME/rex/keys.lua"
link_dotfile "$DOTFILES_DIR/config/rex/actions.lua"       "$CONFIG_HOME/rex/actions.lua"
link_dotfile "$DOTFILES_DIR/config/rex/hosts.lua"         "$CONFIG_HOME/rex/hosts.lua"

# ── Pi ─────────────────────────────────────────────────────────────
info "Installing Pi configs..."
ensure_dir "$HOME/.pi/agent"
link_dotfile "$DOTFILES_DIR/config/pi/settings.json"      "$HOME/.pi/agent/settings.json"

# Only link mcp.json if it doesn't already exist (may contain auth)
if [[ ! -e "$HOME/.pi/agent/mcp.json" ]]; then
  link_dotfile "$DOTFILES_DIR/config/pi/mcp.json"         "$HOME/.pi/agent/mcp.json"
else
  info "Skipped mcp.json (already exists — merge manually if needed)"
fi

# ── Git ────────────────────────────────────────────────────────────
info "Installing Git config..."
link_dotfile "$DOTFILES_DIR/config/git/gitconfig"         "$HOME/.gitconfig"

# ── Vim ────────────────────────────────────────────────────────────
info "Installing Vim config..."
link_dotfile "$DOTFILES_DIR/config/vim/vimrc"             "$HOME/.vimrc"

# Install Vundle and plugins if missing
if [[ ! -d "$HOME/.vim/bundle/Vundle.vim" ]]; then
  info "Installing Vundle..."
  git clone https://github.com/VundleVim/Vundle.vim.git "$HOME/.vim/bundle/Vundle.vim" || warn "Vundle clone failed"
fi

# Try to install plugins silently
if command -v vim >/dev/null 2>&1; then
  vim +PluginInstall +qall 2>/dev/null || warn "Vim plugin install returned non-zero (maybe already installed)"
fi

# ── Bin scripts ───────────────────────────────────────────────────
info "Linking bin scripts..."
ensure_dir "$HOME/.local/bin"
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  warn "Add ~/.local/bin to your PATH if it's not already there"
fi

for script in "$DOTFILES_DIR"/bin/*; do
  [[ -f "$script" ]] || continue
  chmod +x "$script"
done

info "Done!"
info "Reload your shell or run: source ${DOTFILES_DIR}/config/shell/env.sh"
info "Then validate Rex config:  rex config check"
