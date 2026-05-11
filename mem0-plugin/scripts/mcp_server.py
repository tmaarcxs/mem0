#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from _endpoint import (
    headers,
    memory_collection_path,
    memory_history_path,
    memory_item_path,
    memory_create_path,
    resolve_agent_id,
    resolve_user_id,
    search_path,
    url as endpoint_url,
)

Json = dict[str, Any]


DEFAULT_USER_ID = resolve_user_id()
DEFAULT_AGENT_ID = resolve_agent_id()
DEFAULT_TOP_K = 8
TIMEOUT = 20.0


def read_message() -> Json | None:
    first = sys.stdin.buffer.readline()
    if not first:
        return None

    if first.lstrip().startswith(b"{"):
        return json.loads(first.decode("utf-8"))

    headers: dict[str, str] = {}
    line = first
    while line and line not in (b"\r\n", b"\n"):
        name, _, value = line.decode("ascii", "replace").partition(":")
        headers[name.lower()] = value.strip()
        line = sys.stdin.buffer.readline()

    content_length = int(headers.get("content-length", "0"))
    if content_length <= 0:
        return None
    body = sys.stdin.buffer.read(content_length)
    return json.loads(body.decode("utf-8"))


def send_message(message: Json) -> None:
    body = json.dumps(message, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write(f"{body}\n")
    sys.stdout.flush()


def respond(request_id: Any, result: Json) -> None:
    send_message({"jsonrpc": "2.0", "id": request_id, "result": result})


def respond_error(request_id: Any, code: int, message: str) -> None:
    send_message({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def request_json(method: str, path: str, payload: Json | None = None, query: Json | None = None) -> Any:
    request_url = endpoint_url(path)
    if query:
        clean_query = {key: value for key, value in query.items() if value not in (None, "")}
        if clean_query:
            request_url = f"{request_url}?{urllib.parse.urlencode(clean_query)}"

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(request_url, data=body, headers=headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            data = response.read().decode("utf-8", "replace")
            return json.loads(data) if data else {"status": response.status}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:1000]
        raise RuntimeError(f"mem0 returned HTTP {exc.code}: {detail}") from exc


def text_result(value: Any, is_error: bool = False) -> Json:
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False),
            }
        ],
        "isError": is_error,
    }


def defaulted(value: Any, fallback: str | None) -> str | None:
    if value is None:
        return fallback
    if value == "":
        return None
    return str(value)


def tool_schema(name: str, description: str, properties: Json, required: list[str] | None = None) -> Json:
    return {
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required or [],
            "additionalProperties": False,
        },
    }


TOOLS = [
    tool_schema(
        "add_memory",
        "Save text or conversation messages to the self-hosted Mem0 REST API.",
        {
            "text": {"type": "string", "description": "Text to store as a user memory. Use either text or messages."},
            "messages": {
                "type": "array",
                "description": "Conversation messages to store instead of text.",
                "items": {
                    "type": "object",
                    "properties": {
                        "role": {"type": "string", "description": "Message role, usually user or assistant."},
                        "content": {"type": "string"},
                    },
                    "required": ["role", "content"],
                    "additionalProperties": False,
                },
            },
            "user_id": {"type": "string", "description": f"Memory user_id. Defaults to {DEFAULT_USER_ID}. Empty string disables the default."},
            "agent_id": {"type": "string", "description": f"Memory agent_id. Defaults to {DEFAULT_AGENT_ID}. Empty string disables the default."},
            "run_id": {"type": "string"},
            "metadata": {"type": "object"},
            "infer": {"type": "boolean", "description": "Whether Mem0 should infer facts from messages. Defaults to true."},
            "memory_type": {"type": "string", "description": "Optional category label stored in metadata.type, except procedural_memory which is passed to Mem0's procedural memory mode."},
            "prompt": {"type": "string"},
        },
    ),
    tool_schema(
        "search_memories",
        "Semantic search across self-hosted Mem0 memories.",
        {
            "query": {"type": "string"},
            "user_id": {"type": "string", "description": f"Defaults to {DEFAULT_USER_ID}. Empty string searches without user_id filter."},
            "agent_id": {"type": "string"},
            "run_id": {"type": "string"},
            "filters": {"type": "object", "description": "Additional Mem0 filters. user_id/agent_id/run_id are merged here."},
            "top_k": {"type": "integer", "minimum": 1, "maximum": 100, "default": DEFAULT_TOP_K},
            "threshold": {"type": "number"},
        },
        ["query"],
    ),
    tool_schema(
        "get_memories",
        "List self-hosted Mem0 memories by user_id, agent_id, or run_id.",
        {
            "user_id": {"type": "string", "description": f"Defaults to {DEFAULT_USER_ID}. Empty string lists without user_id filter."},
            "agent_id": {"type": "string"},
            "run_id": {"type": "string"},
        },
    ),
    tool_schema(
        "get_memory",
        "Retrieve a specific self-hosted Mem0 memory by ID.",
        {"memory_id": {"type": "string"}},
        ["memory_id"],
    ),
    tool_schema(
        "get_memory_history",
        "Retrieve update history for a specific self-hosted Mem0 memory by ID.",
        {"memory_id": {"type": "string"}},
        ["memory_id"],
    ),
    tool_schema(
        "update_memory",
        "Overwrite a self-hosted Mem0 memory's text by ID.",
        {
            "memory_id": {"type": "string"},
            "text": {"type": "string"},
            "metadata": {"type": "object"},
        },
        ["memory_id", "text"],
    ),
    tool_schema(
        "delete_memory",
        "Delete one self-hosted Mem0 memory by ID.",
        {"memory_id": {"type": "string"}},
        ["memory_id"],
    ),
    tool_schema(
        "delete_all_memories",
        "Delete all self-hosted Mem0 memories in a scope. Requires confirm=true.",
        {
            "user_id": {"type": "string", "description": f"Defaults to {DEFAULT_USER_ID}. Empty string means no user_id filter."},
            "agent_id": {"type": "string"},
            "run_id": {"type": "string"},
            "confirm": {"type": "boolean", "description": "Must be true to delete memories."},
        },
        ["confirm"],
    ),
    tool_schema(
        "list_entities",
        "List user_id, agent_id, and run_id values present in self-hosted Mem0 memories.",
        {
            "user_id": {"type": "string", "description": "Optional user_id filter. Empty string disables the default and scans all visible memories."},
            "agent_id": {"type": "string"},
            "run_id": {"type": "string"},
        },
    ),
    tool_schema(
        "delete_entities",
        "Delete memories for a user_id, agent_id, or run_id in self-hosted Mem0. Requires confirm=true.",
        {
            "entity_type": {"type": "string", "enum": ["user_id", "agent_id", "run_id"]},
            "entity_id": {"type": "string"},
            "confirm": {"type": "boolean", "description": "Must be true to delete memories for the entity."},
        },
        ["entity_type", "entity_id", "confirm"],
    ),
]


def add_memory(args: Json) -> Any:
    messages = args.get("messages")
    text = args.get("text")
    if not messages:
        if not text:
            raise ValueError("Provide either text or messages.")
        messages = [{"role": "user", "content": text}]

    payload: Json = {"messages": messages}
    for key in ("run_id", "prompt"):
        if key in args and args[key] is not None:
            payload[key] = args[key]
    metadata = dict(args.get("metadata") or {})
    memory_type = args.get("memory_type")
    if memory_type == "procedural_memory":
        payload["memory_type"] = memory_type
    elif memory_type and "type" not in metadata:
        metadata["type"] = memory_type
    if metadata:
        payload["metadata"] = metadata
    payload["user_id"] = defaulted(args.get("user_id"), DEFAULT_USER_ID)
    payload["agent_id"] = defaulted(args.get("agent_id"), DEFAULT_AGENT_ID)
    payload["infer"] = args.get("infer", True)
    return request_json("POST", memory_create_path(), payload)


def search_memories(args: Json) -> Any:
    filters = dict(args.get("filters") or {})
    user_id = defaulted(args.get("user_id"), DEFAULT_USER_ID)
    if user_id and "user_id" not in filters:
        filters["user_id"] = user_id
    for key in ("agent_id", "run_id"):
        value = args.get(key)
        if value not in (None, "") and key not in filters:
            filters[key] = value

    payload: Json = {"query": args["query"], "top_k": args.get("top_k", DEFAULT_TOP_K)}
    if filters:
        payload["filters"] = filters
    if args.get("threshold") is not None:
        payload["threshold"] = args["threshold"]
    return request_json("POST", search_path(), payload)


def scope_query(args: Json, default_user: bool = True) -> Json:
    query: Json = {}
    user_default = DEFAULT_USER_ID if default_user else None
    user_id = defaulted(args.get("user_id"), user_default) if "user_id" in args or default_user else None
    if user_id:
        query["user_id"] = user_id
    for key in ("agent_id", "run_id"):
        if args.get(key) not in (None, ""):
            query[key] = args[key]
    return query


def list_entities(args: Json) -> Any:
    data = request_json("GET", memory_collection_path(), query=scope_query(args, default_user=False))
    memories = data.get("results", data) if isinstance(data, dict) else data
    entities: dict[str, set[str]] = {"user_id": set(), "agent_id": set(), "run_id": set()}
    if isinstance(memories, list):
        for item in memories:
            if isinstance(item, dict):
                for key in entities:
                    value = item.get(key)
                    if value:
                        entities[key].add(str(value))
    return {key: sorted(values) for key, values in entities.items()}


def delete_all_memories(args: Json) -> Any:
    if args.get("confirm") is not True:
        raise ValueError("delete_all_memories requires confirm=true.")
    return request_json("DELETE", memory_collection_path(), query=scope_query(args))


def delete_entities(args: Json) -> Any:
    if args.get("confirm") is not True:
        raise ValueError("delete_entities requires confirm=true.")
    entity_type = args["entity_type"]
    return request_json("DELETE", memory_collection_path(), query={entity_type: args["entity_id"]})


TOOL_HANDLERS = {
    "add_memory": add_memory,
    "search_memories": search_memories,
    "get_memories": lambda args: request_json("GET", memory_collection_path(), query=scope_query(args)),
    "get_memory": lambda args: request_json("GET", memory_item_path(args["memory_id"])),
    "get_memory_history": lambda args: request_json("GET", memory_history_path(args["memory_id"])),
    "update_memory": lambda args: request_json(
        "PUT",
        memory_item_path(args["memory_id"]),
        {key: args[key] for key in ("text", "metadata") if key in args and args[key] is not None},
    ),
    "delete_memory": lambda args: request_json("DELETE", memory_item_path(args["memory_id"])),
    "delete_all_memories": delete_all_memories,
    "list_entities": list_entities,
    "delete_entities": delete_entities,
}


def handle_request(message: Json) -> None:
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}

    if request_id is None:
        return

    if method == "initialize":
        respond(
            request_id,
            {
                "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "mem0-selfhosted", "version": "0.1.0"},
            },
        )
        return

    if method == "ping":
        respond(request_id, {})
        return

    if method == "tools/list":
        respond(request_id, {"tools": TOOLS})
        return

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if not isinstance(name, str):
            respond_error(request_id, -32602, "Tool name must be a string.")
            return
        if not isinstance(args, dict):
            respond_error(request_id, -32602, "Tool arguments must be an object.")
            return
        handler = TOOL_HANDLERS.get(name)
        if not handler:
            respond_error(request_id, -32602, f"Unknown tool: {name}")
            return
        try:
            respond(request_id, text_result(handler(args)))
        except Exception as exc:
            respond(request_id, text_result({"error": str(exc)}, is_error=True))
        return

    if method in {"resources/list", "prompts/list"}:
        key = "resources" if method == "resources/list" else "prompts"
        respond(request_id, {key: []})
        return

    respond_error(request_id, -32601, f"Method not found: {method}")


def main() -> None:
    while True:
        try:
            message = read_message()
        except Exception as exc:
            respond_error(None, -32700, f"Parse error: {exc}")
            continue
        if message is None:
            break
        handle_request(message)


if __name__ == "__main__":
    main()
