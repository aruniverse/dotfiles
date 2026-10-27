# Homebrew environment for login shells on Apple Silicon, Intel Macs, and Linux.
if command -v brew >/dev/null 2>&1; then
  eval "$(brew shellenv)"
else
  for _dotfiles_brew in /opt/homebrew/bin/brew /usr/local/bin/brew \
    /home/linuxbrew/.linuxbrew/bin/brew; do
    if [ -x "$_dotfiles_brew" ]; then
      eval "$("$_dotfiles_brew" shellenv)"
      break
    fi
  done
  unset _dotfiles_brew
fi
