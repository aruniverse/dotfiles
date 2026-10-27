# Interactive Zsh preferences. Optional integrations load only when installed.
export ZSH="${ZSH:-$HOME/.oh-my-zsh}"
if [[ -f "$ZSH/oh-my-zsh.sh" ]] && ! (( $+functions[omz] )); then
  ZSH_THEME="${ZSH_THEME:-agnoster}"
  ENABLE_CORRECTION="true"
  COMPLETION_WAITING_DOTS="true"
  zstyle ':omz:update' mode auto
  plugins=(git)
  if command -v fzf >/dev/null 2>&1; then plugins+=(fzf); fi
  if [[ -f "${ZSH_CUSTOM:-$ZSH/custom}/plugins/fzf-tab/fzf-tab.plugin.zsh" ]]; then
    plugins+=(fzf-tab)
  fi
  source "$ZSH/oh-my-zsh.sh"
fi

if [[ -f "$HOME/.iterm2_shell_integration.zsh" && -z "${ITERM_SHELL_INTEGRATION_INSTALLED:-}" ]]; then
  source "$HOME/.iterm2_shell_integration.zsh"
fi
