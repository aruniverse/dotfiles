# Resume a registered Pi conversation only on the first prompt of a restored Rex pane.
case $- in *i*) ;; *) return 0 ;; esac
[ -t 0 ] && [ -t 1 ] || return 0
[ -n "${REX_SESSION:-}" ] && [ -n "${REX_BLOCK:-}" ] || return 0
[ "${REX_PI_RESTORE:-1}" != 0 ] || return 0
[ "${_REX_PI_RESTORE_HOOK_INSTALLED:-0}" != 1 ] || return 0
_REX_PI_RESTORE_HOOK_INSTALLED=1

_rex_pi_restore_once() {
  [ "${_REX_PI_RESTORE_RAN:-0}" != 1 ] || return 0
  _REX_PI_RESTORE_RAN=1
  if [ -x "$HOME/.local/bin/rex-restore-pi" ]; then
    # A missing dependency or failed restore must still leave a usable shell prompt.
    if ! "$HOME/.local/bin/rex-restore-pi"; then
      printf '%s\n' '[rex-pi-restore] Shell ready; no replacement conversation was started.' >&2
    fi
  fi
  return 0
}

if [ -n "${ZSH_VERSION:-}" ]; then
  precmd_functions+=(_rex_pi_restore_once)
elif [ -n "${BASH_VERSION:-}" ]; then
  if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == "declare -a"* ]]; then
    PROMPT_COMMAND+=(_rex_pi_restore_once)
  else
    PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND}; }_rex_pi_restore_once"
  fi
fi
