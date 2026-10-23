#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

info() { printf '[dotfiles] %s\n' "$*"; }

link_dotfile() {
  local src="$1" dst="$2"
  if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
    return
  fi
  if [[ -e "$dst" || -L "$dst" ]]; then
    info "Kept $dst (merge $src manually)"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  info "Linked $dst"
}

copy_template() {
  local src="$1" dst="$2"
  if [[ -e "$dst" || -L "$dst" ]]; then
    info "Kept $dst (merge $src manually)"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  # Applications can save private settings here; never write them back into Git.
  cp "$src" "$dst"
  info "Copied $dst"
}

append_source() {
  local rc="$1" src="$2" line
  mkdir -p "$(dirname "$rc")"
  touch "$rc"
  line="$(printf '[ ! -f %q ] || . %q' "$src" "$src")"
  if ! grep -Fqx "$line" "$rc"; then
    printf '\n# dotfiles\n%s\n' "$line" >> "$rc"
  fi
}

case "${SHELL:-/bin/bash}" in
  *zsh)
    append_source "$HOME/.zprofile" "$DOTFILES_DIR/config/shell/profile.sh"
    append_source "$HOME/.zprofile" "$DOTFILES_DIR/config/shell/env.sh"
    append_source "$HOME/.zshrc" "$DOTFILES_DIR/config/shell/env.sh"
    append_source "$HOME/.zshrc" "$DOTFILES_DIR/config/shell/zshrc.zsh"
    ;;
  *bash)
    login_rc="$HOME/.bash_profile"
    for rc in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
      if [[ -f "$rc" ]]; then login_rc="$rc"; break; fi
    done
    append_source "$login_rc" "$DOTFILES_DIR/config/shell/profile.sh"
    append_source "$login_rc" "$DOTFILES_DIR/config/shell/env.sh"
    append_source "$HOME/.bashrc" "$DOTFILES_DIR/config/shell/env.sh"
    ;;
  *) info "Shell not managed; see README.md for Bash/Zsh setup" ;;
esac

for file in init.lua keys.lua actions.lua hosts.lua; do
  link_dotfile "$DOTFILES_DIR/config/rex/$file" "$CONFIG_HOME/rex/$file"
done

copy_template "$DOTFILES_DIR/config/pi/settings.json" "$HOME/.pi/agent/settings.json"
copy_template "$DOTFILES_DIR/config/pi/mcp.json" "$HOME/.pi/agent/mcp.json"
copy_template "$DOTFILES_DIR/config/pi/extensions/auto-session-name.ts" \
  "$HOME/.pi/agent/extensions/auto-session-name.ts"

link_dotfile "$DOTFILES_DIR/config/git/gitconfig" "$HOME/.gitconfig"
link_dotfile "$DOTFILES_DIR/config/git/ignore" "$HOME/.gitignore_global"
link_dotfile "$DOTFILES_DIR/config/vim/vimrc" "$HOME/.vimrc"

copy_template "$DOTFILES_DIR/config/gh/config.yml" "${GH_CONFIG_DIR:-$CONFIG_HOME/gh}/config.yml"
copy_template "$DOTFILES_DIR/config/herdr/config.toml" "$CONFIG_HOME/herdr/config.toml"
copy_template "$DOTFILES_DIR/config/zed/settings.json" "$CONFIG_HOME/zed/settings.json"
case "$(uname -s)" in
  Darwin) code_user="$HOME/Library/Application Support/Code/User" ;;
  Linux) code_user="$CONFIG_HOME/Code/User" ;;
  *) code_user="" ;;
esac
if [[ -n "$code_user" ]]; then
  copy_template "$DOTFILES_DIR/config/vscode/settings.json" "$code_user/settings.json"
fi

for script in "$DOTFILES_DIR"/bin/*; do
  [[ -f "$script" ]] || continue
  link_dotfile "$script" "$HOME/.local/bin/$(basename "$script")"
done

info "Done. Restart your login shell to load the environment."
info "Existing configs were kept. See README.md for merging and dependency setup."
