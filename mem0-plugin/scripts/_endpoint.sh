# Source this file. Sets endpoint and identity variables for hooks.

mem0_env_value() {
  case "${1:-}" in
    ""|'${'*) return 1 ;;
    *) printf '%s' "$1" ;;
  esac
}

MEM0_BASE_URL_RESOLVED="$(mem0_env_value "${MEM0_BASE_URL:-}" || printf 'https://api.mem0.ai')"
MEM0_IS_SELF_HOSTED=0
if mem0_env_value "${MEM0_BASE_URL:-}" >/dev/null && [ "${MEM0_BASE_URL#*api.mem0.ai}" = "$MEM0_BASE_URL" ]; then
  MEM0_IS_SELF_HOSTED=1
fi

MEM0_IS_CONFIGURED=0
if [ "$MEM0_IS_SELF_HOSTED" = "1" ]; then
  MEM0_IS_CONFIGURED=1
elif mem0_env_value "${MEM0_API_KEY:-}" >/dev/null; then
  MEM0_IS_CONFIGURED=1
fi

if [ "$MEM0_IS_SELF_HOSTED" = "1" ]; then
  MEM0_RESOLVED_USER_ID="$(mem0_env_value "${MEM0_USER_ID:-}" || mem0_env_value "${USER:-}" || printf 'default')"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=_identity.sh
  . "$SCRIPT_DIR/_identity.sh"
fi

MEM0_RESOLVED_AGENT_ID="$(mem0_env_value "${MEM0_AGENT_ID:-}" || printf 'claude-code')"
export MEM0_BASE_URL_RESOLVED MEM0_IS_SELF_HOSTED MEM0_IS_CONFIGURED MEM0_RESOLVED_USER_ID MEM0_RESOLVED_AGENT_ID
