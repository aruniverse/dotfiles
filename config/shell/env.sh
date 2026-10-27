# Shared Bash/Zsh environment. No machine-specific environment values belong here.
if [ -z "${DOTFILES_ROOT:-}" ]; then
  if [ -n "${BASH_VERSION:-}" ]; then
    _dotfiles_source="${BASH_SOURCE[0]}"
  elif [ -n "${ZSH_VERSION:-}" ]; then
    _dotfiles_source="${(%):-%x}"
  fi
  DOTFILES_ROOT="$(cd "$(dirname "$_dotfiles_source")/../.." && pwd)"
  unset _dotfiles_source
fi
export DOTFILES_ROOT

export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export REX_CONFIG="${REX_CONFIG:-$XDG_CONFIG_HOME/rex/init.lua}"
export EDITOR="${EDITOR:-vim}"
export VISUAL="${VISUAL:-$EDITOR}"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if ! command -v nvm >/dev/null 2>&1; then
  for _dotfiles_nvm in "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/nvm/nvm.sh" \
    /usr/local/opt/nvm/nvm.sh "$NVM_DIR/nvm.sh"; do
    if [ -s "$_dotfiles_nvm" ]; then
      . "$_dotfiles_nvm"
      break
    fi
  done
  unset _dotfiles_nvm
fi

for _dotfiles_bin in "$HOME/.local/bin" "${REX_BIN_DIR:-}"; do
  [ -d "$_dotfiles_bin" ] || continue
  case ":$PATH:" in
    *":$_dotfiles_bin:"*) ;;
    *) export PATH="$_dotfiles_bin:$PATH" ;;
  esac
done
unset _dotfiles_bin

alias dot='cd "$DOTFILES_ROOT"'
alias rexreload='rex config reload'
alias rexcheck='rex config check'
