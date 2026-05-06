#!/usr/bin/env bash
# Hook: UserPromptSubmit
#
# Fires on every user message. Searches mem0 for relevant memories
# and injects them into Claude's context before processing.
#
# Input:  JSON on stdin with prompt, session_id, cwd, transcript_path
# Output: Matching memories as context text (exit 0)
#
# Skips search for very short prompts (< 20 chars). Uses a 3s timeout
# to minimize latency and never blocks the user's prompt.

set -uo pipefail

is_placeholder() {
  case "${1:-}" in
    ""|'${'*) return 0 ;;
    *) return 1 ;;
  esac
}

env_or_empty() {
  local value="${1:-}"
  if is_placeholder "$value"; then
    printf ''
  else
    printf '%s' "$value"
  fi
}

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")

if [ ${#PROMPT} -lt 20 ]; then
  exit 0
fi

BASE_URL=$(env_or_empty "${MEM0_SELFHOSTED_URL:-${MEM0_BASE_URL:-}}")
SELFHOSTED_API_KEY=$(env_or_empty "${MEM0_SELFHOSTED_API_KEY:-}")
HOSTED_API_KEY=$(env_or_empty "${MEM0_API_KEY:-}")
USER_ID=$(env_or_empty "${MEM0_SELFHOSTED_USER_ID:-${MEM0_USER_ID:-${USER:-default}}}")
TOP_K=$(env_or_empty "${MEM0_SELFHOSTED_TOP_K:-${MEM0_TOP_K:-5}}")

if ! [[ "$TOP_K" =~ ^[0-9]+$ ]]; then
  TOP_K=5
fi
if [ -z "$USER_ID" ]; then
  USER_ID=default
fi

BODY=$(jq -n --arg query "$PROMPT" --arg user_id "$USER_ID" --argjson top_k "$TOP_K" \
  '{query: $query, filters: {user_id: $user_id}, top_k: $top_k}')

CURL_ARGS=(-s --max-time 3 -X POST -H "Content-Type: application/json" -d "$BODY")

if [ -n "$BASE_URL" ]; then
  ENDPOINT="${BASE_URL%/}/search"
  if [ -n "$SELFHOSTED_API_KEY" ]; then
    CURL_ARGS+=(-H "X-API-Key: $SELFHOSTED_API_KEY" -H "Authorization: Bearer $SELFHOSTED_API_KEY")
  fi
else
  if [ -z "$HOSTED_API_KEY" ]; then
    exit 0
  fi
  ENDPOINT="https://api.mem0.ai/v2/memories/search/"
  CURL_ARGS+=(-H "Authorization: Token $HOSTED_API_KEY")
fi

RESPONSE=$(curl "${CURL_ARGS[@]}" "$ENDPOINT" 2>/dev/null || echo "")

if [ -z "$RESPONSE" ]; then
  exit 0
fi

MEMORIES=$(echo "$RESPONSE" | jq -r '
  if type == "array" then . else .results // [] end |
  if length == 0 then empty else
  "## Relevant memories from mem0\n\n" +
  (map((.memory // .text // .content) | select(. != null) | "- " + .) | join("\n"))
  end
' 2>/dev/null || echo "")

if [ -n "$MEMORIES" ]; then
  echo "$MEMORIES"
fi

exit 0
