from __future__ import annotations

import os
from urllib.parse import quote

from _identity import resolve_user_id as resolve_hosted_user_id

HOSTED_BASE_URL = "https://api.mem0.ai"


def env_value(name: str) -> str | None:
    value = os.environ.get(name)
    if not value:
        return None
    if value.startswith("${") and value.endswith("}"):
        return None
    return value


def base_url() -> str:
    return (env_value("MEM0_BASE_URL") or HOSTED_BASE_URL).rstrip("/")


def is_self_hosted() -> bool:
    configured_base = env_value("MEM0_BASE_URL")
    return bool(configured_base and "api.mem0.ai" not in configured_base)


def api_key() -> str:
    return env_value("MEM0_API_KEY") or ""


def configured() -> bool:
    return is_self_hosted() or bool(api_key())


def resolve_user_id() -> str:
    if is_self_hosted():
        return env_value("MEM0_USER_ID") or env_value("USER") or "default"
    return resolve_hosted_user_id()


def resolve_agent_id(default: str = "claude-code") -> str:
    return env_value("MEM0_AGENT_ID") or default


def headers() -> dict[str, str]:
    result = {"Content-Type": "application/json"}
    if is_self_hosted():
        return result
    key = api_key()
    if key:
        result["Authorization"] = f"Token {key}"
    return result


def memory_create_path() -> str:
    return "/memories" if is_self_hosted() else "/v1/memories/"


def memory_collection_path() -> str:
    return "/memories" if is_self_hosted() else "/v1/memories/"


def memory_item_path(memory_id: str) -> str:
    encoded = quote(memory_id, safe="")
    return f"/memories/{encoded}" if is_self_hosted() else f"/v1/memories/{encoded}/"


def memory_history_path(memory_id: str) -> str:
    encoded = quote(memory_id, safe="")
    return f"/memories/{encoded}/history" if is_self_hosted() else f"/v1/memories/{encoded}/history/"


def search_path() -> str:
    return "/search" if is_self_hosted() else "/v1/memories/search/"


def url(path: str) -> str:
    return f"{base_url()}{path}"
