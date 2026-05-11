import type { Part } from "@opencode-ai/sdk";
import type { Config, Plugin, PluginModule, PluginOptions } from "@opencode-ai/plugin";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Mem0Options = PluginOptions & {
  mcpName?: string;
  overwriteMcp?: boolean;
  selfHostedUrl?: string;
  userId?: string;
  agentId?: string;
  timeout?: number;
  topK?: number;
  promptSearch?: boolean;
  storeOnCompact?: boolean;
};

type SessionState = {
  prompts: string[];
  assistant: string[];
  memories: string[];
  lastSearchAt: number;
};

type SearchResult = {
  memory?: string;
  text?: string;
  content?: string;
};

const SESSION_LIMIT = 8;
const MAX_MEMORY_LINES = 6;
const MAX_TEXT_LENGTH = 1600;
const sessions = new Map<string, SessionState>();

function pluginRoot() {
  const current = dirname(fileURLToPath(import.meta.url));
  return ["dist", "src"].includes(current.split(/[\\/]/).at(-1) || "") ? dirname(current) : current;
}

function envValue(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  if (value.startsWith("${") && value.endsWith("}")) return undefined;
  return value;
}

function stringOption(options: Mem0Options, key: keyof Mem0Options, fallback?: string) {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOption(options: Mem0Options, key: keyof Mem0Options, fallback: number) {
  const value = options[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function booleanOption(options: Mem0Options, key: keyof Mem0Options, fallback: boolean) {
  const value = options[key];
  return typeof value === "boolean" ? value : fallback;
}

function baseUrl(options: Mem0Options) {
  return (stringOption(options, "selfHostedUrl") || envValue("MEM0_BASE_URL") || "http://localhost:8888").replace(/\/+$/, "");
}

function userId(options: Mem0Options) {
  return stringOption(options, "userId") || envValue("MEM0_USER_ID") || envValue("USER") || "default";
}

function agentId(options: Mem0Options) {
  return stringOption(options, "agentId") || envValue("MEM0_AGENT_ID") || "opencode";
}

function headers(_options: Mem0Options) {
  return { "Content-Type": "application/json" };
}

function getSession(sessionID: string) {
  const existing = sessions.get(sessionID);
  if (existing) return existing;
  const next: SessionState = { prompts: [], assistant: [], memories: [], lastSearchAt: 0 };
  sessions.set(sessionID, next);
  return next;
}

function pushLimited(items: string[], value: string, limit = SESSION_LIMIT) {
  const text = value.trim();
  if (!text) return;
  items.push(text.slice(0, MAX_TEXT_LENGTH));
  if (items.length > limit) items.splice(0, items.length - limit);
}

function textFromParts(parts: Part[]) {
  return parts
    .filter((part) => part.type === "text" && !part.ignored)
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function memoryText(result: SearchResult) {
  return result.memory || result.text || result.content || "";
}

async function searchMemories(query: string, options: Mem0Options) {
  const topK = numberOption(options, "topK", 5);
  const response = await fetch(`${baseUrl(options)}/search`, {
    method: "POST",
    headers: headers(options),
    body: JSON.stringify({ query, filters: { user_id: userId(options) }, top_k: topK }),
  });

  if (!response.ok) return [];
  const payload = await response.json().catch(() => undefined);
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
  return rows.map(memoryText).filter(Boolean).slice(0, MAX_MEMORY_LINES);
}

function memoryBlock(memories: string[]) {
  if (memories.length === 0) return "";
  return `## Relevant memories from mem0\n\n${memories.map((memory) => `- ${memory}`).join("\n")}`;
}

function sessionSummary(state: SessionState) {
  const parts = ["OpenCode session state for Mem0 recovery."];
  if (state.prompts.length) parts.push(`Recent user prompts:\n${state.prompts.map((prompt) => `- ${prompt}`).join("\n")}`);
  if (state.assistant.length) parts.push(`Recent assistant outputs:\n${state.assistant.map((text) => `- ${text}`).join("\n")}`);
  return parts.join("\n\n");
}

async function storeSessionState(sessionID: string, state: SessionState, options: Mem0Options) {
  if (!booleanOption(options, "storeOnCompact", true)) return;
  if (state.prompts.length < 2 && state.assistant.length === 0) return;

  await fetch(`${baseUrl(options)}/memories`, {
    method: "POST",
    headers: headers(options),
    body: JSON.stringify({
      messages: [{ role: "user", content: sessionSummary(state) }],
      user_id: userId(options),
      agent_id: agentId(options),
      metadata: { type: "session_state", source: "opencode-plugin", session_id: sessionID },
    }),
  }).catch(() => undefined);
}

function mcpEnvironment(options: Mem0Options) {
  const environment: Record<string, string> = {
    MEM0_USER_ID: userId(options),
    MEM0_AGENT_ID: agentId(options),
  };
  const url = stringOption(options, "selfHostedUrl") || envValue("MEM0_BASE_URL");
  if (url) environment.MEM0_BASE_URL = url;
  return environment;
}

function registerMcp(input: Config, options: Mem0Options) {
  const mcpName = stringOption(options, "mcpName", "mem0") || "mem0";
  input.mcp = input.mcp || {};
  if (input.mcp[mcpName] && !booleanOption(options, "overwriteMcp", false)) return;

  input.mcp[mcpName] = {
    type: "local",
    command: ["python3", join(pluginRoot(), "scripts", "mcp_server.py")],
    environment: mcpEnvironment(options),
    enabled: true,
    timeout: numberOption(options, "timeout", 5000),
  };
}

const SYSTEM_CONTEXT = `You have persistent memory through the mem0 MCP tools registered by this OpenCode plugin. Before tasks involving existing projects, files, preferences, decisions, or prior work, search mem0 for relevant context and use it to avoid repeating mistakes. Store only durable, non-obvious decisions, preferences, setup discoveries, and session state. Do not add a leading date to memory text unless the date itself is semantically important; timestamps are already stored as metadata.`;

export const Mem0OpenCodePlugin: Plugin = async (_ctx, rawOptions = {}) => {
  const options = rawOptions as Mem0Options;

  return {
    async config(input) {
      registerMcp(input, options);
    },

    async "experimental.chat.system.transform"(_input, output) {
      output.system.push(SYSTEM_CONTEXT);
    },

    async "chat.message"(input, output) {
      if (!booleanOption(options, "promptSearch", true)) return;
      const prompt = textFromParts(output.parts);
      const state = getSession(input.sessionID);
      pushLimited(state.prompts, prompt);
      if (prompt.length < 12) return;

      const memories = await searchMemories(prompt, options).catch(() => []);
      state.memories = memories;
      state.lastSearchAt = Date.now();

      const block = memoryBlock(memories);
      if (!block) return;

      output.parts.push({
        id: `mem0-context-${randomUUID()}`,
        sessionID: input.sessionID,
        messageID: input.messageID || output.message.id,
        type: "text",
        text: `\n\n${block}`,
        synthetic: true,
        metadata: { source: "mem0" },
      });
    },

    async "experimental.text.complete"(input, output) {
      const text = output.text.trim();
      if (text.length < 80) return;
      pushLimited(getSession(input.sessionID).assistant, text, 4);
    },

    async "experimental.session.compacting"(input, output) {
      const state = getSession(input.sessionID);
      if (state.memories.length) output.context.push(memoryBlock(state.memories));
      if (state.prompts.length || state.assistant.length) output.context.push(sessionSummary(state));
      await storeSessionState(input.sessionID, state, options);
    },
  };
};

export default { id: "mem0", server: Mem0OpenCodePlugin } satisfies PluginModule;
