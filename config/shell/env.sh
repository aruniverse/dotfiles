# dotfiles environment
# Source this from ~/.zshrc or ~/.bashrc:
#   [ -f "$HOME/.dotfiles/config/shell/env.sh" ] && source "$HOME/.dotfiles/config/shell/env.sh"

# Adjust this if your dotfiles repo lives somewhere other than ~/.dotfiles
DOTFILES_ROOT="${DOTFILES_ROOT:-$HOME/.dotfiles}"
if [[ ! -d "$DOTFILES_ROOT" ]]; then
  DOTFILES_ROOT="$HOME/repos/aruniverse/dotfiles"
fi

# ── XDG Base Directory ─────────────────────────────────────────────
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"

# ── Rex ────────────────────────────────────────────────────────────
export REX_CONFIG="${REX_CONFIG:-$XDG_CONFIG_HOME/rex/init.lua}"

# Ensure Rex binary stays on PATH inside Rex terminals
if [ -n "${REX_BIN_DIR:-}" ]; then
  case ":$PATH:" in
    *":$REX_BIN_DIR:"*) ;;
    *) export PATH="$REX_BIN_DIR:$PATH" ;;
  esac
fi

# ── Pi / Agents ──────────────────────────────────────────────────
# Pi uses hardcoded ~/.pi, but we document env vars here in case they are added.
#export PI_CONFIG_DIR="${PI_CONFIG_DIR:-$XDG_CONFIG_HOME/pi}"
#export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
#export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

# ── User local bin ─────────────────────────────────────────────────
if [ -d "$HOME/.local/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi

# ── Editor ─────────────────────────────────────────────────────────
export EDITOR="${EDITOR:-vim}"
export VISUAL="${VISUAL:-vim}"

# ── Aliases ────────────────────────────────────────────────────────
alias dot='cd "$DOTFILES_ROOT"'
alias rexreload='rex config reload'
alias rexcheck='rex config check'
