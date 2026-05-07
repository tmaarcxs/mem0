import { Entity, Memory } from "@/types/api";
import { GraphLink, GraphModel, GraphNode, GraphNodeType } from "./types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "been",
  "before",
  "being",
  "claude",
  "code",
  "could",
  "from",
  "have",
  "into",
  "like",
  "memory",
  "memories",
  "more",
  "only",
  "should",
  "that",
  "their",
  "there",
  "this",
  "through",
  "using",
  "when",
  "where",
  "with",
  "would",
  "your",
]);

const NODE_ORDER: GraphNodeType[] = ["memory", "user", "agent", "run", "keyword"];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9_/-]+/g, " ")
    .trim();
}

function wordsFor(memory: Memory) {
  return normalizeText(memory.memory || "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .slice(0, 80);
}

function labelFor(value: string, max = 34) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function addNode(nodes: Map<string, GraphNode>, node: Omit<GraphNode, "x" | "y">) {
  if (nodes.has(node.id)) {
    const existing = nodes.get(node.id)!;
    existing.weight = Math.max(existing.weight, node.weight);
    return;
  }
  nodes.set(node.id, { ...node, x: 0, y: 0 });
}

function addLink(links: Map<string, GraphLink>, link: GraphLink) {
  const current = links.get(link.id);
  if (current) {
    current.weight = Math.max(current.weight, link.weight);
    return;
  }
  links.set(link.id, link);
}

function scopeId(type: GraphNodeType, value?: string) {
  return value ? `${type}:${value}` : "";
}

function memoryDate(memory: Memory) {
  const raw = memory.updated_at || memory.created_at;
  if (!raw) return "Undated";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toISOString().slice(0, 10);
}

function dominantKeyword(memory: Memory, keywordCounts: Array<{ keyword: string; count: number }>) {
  const text = normalizeText(memory.memory || "");
  return keywordCounts.find((item) => text.includes(item.keyword))?.keyword || "uncategorized";
}

function graphBounds(nodes: GraphNode[]) {
  if (nodes.length === 0) return { minX: -600, maxX: 600, minY: -420, maxY: 420 };
  return nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      maxX: Math.max(bounds.maxX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxY: Math.max(bounds.maxY, node.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function relaxNodes(nodes: GraphNode[]) {
  const memoryNodes = nodes.filter((node) => node.type === "memory");
  const minDistance = 46;

  for (let pass = 0; pass < 18; pass += 1) {
    for (let i = 0; i < memoryNodes.length; i += 1) {
      for (let j = i + 1; j < memoryNodes.length; j += 1) {
        const left = memoryNodes[i];
        const right = memoryNodes[j];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance >= minDistance) continue;

        const push = (minDistance - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        left.x -= ux * push;
        left.y -= uy * push;
        right.x += ux * push;
        right.y += uy * push;
      }
    }
  }
}

function placeNodes(nodes: GraphNode[], keywordCounts: Array<{ keyword: string; count: number }>) {
  const sorted = [...nodes].sort((a, b) => {
    const byType = NODE_ORDER.indexOf(a.type) - NODE_ORDER.indexOf(b.type);
    return byType || b.weight - a.weight || a.label.localeCompare(b.label);
  });

  const keywordNodes = sorted.filter((node) => node.type === "keyword");
  const entityNodes = sorted.filter((node) => ["user", "agent", "run"].includes(node.type));
  const memoryNodes = sorted.filter((node) => node.type === "memory");
  const clusters = new Map<string, GraphNode[]>();

  keywordNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(keywordNodes.length, 1)) * Math.PI * 2;
    node.x = Math.cos(angle) * 920;
    node.y = Math.sin(angle) * 560;
  });

  entityNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(entityNodes.length, 1)) * Math.PI * 2;
    node.x = Math.cos(angle) * 250;
    node.y = Math.sin(angle) * 170;
  });

  for (const node of memoryNodes) {
    const key = node.memory ? dominantKeyword(node.memory, keywordCounts.slice(0, 12)) : "uncategorized";
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(node);
  }

  const clusterEntries = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length);
  clusterEntries.forEach(([keyword, cluster], clusterIndex) => {
    const keywordNode = sorted.find((node) => node.id === `keyword:${keyword}`);
    const angle = -Math.PI / 2 + (clusterIndex / Math.max(clusterEntries.length, 1)) * Math.PI * 2;
    const centerX = keywordNode?.x ?? Math.cos(angle) * 720;
    const centerY = keywordNode?.y ?? Math.sin(angle) * 450;
    const spacing = cluster.length > 28 ? 54 : 62;

    cluster.forEach((node, index) => {
      const spiralAngle = index * 2.399963229728653 + clusterIndex * 0.41;
      const radius = 82 + Math.sqrt(index) * spacing;
      node.x = centerX + Math.cos(spiralAngle) * radius;
      node.y = centerY + Math.sin(spiralAngle) * radius;
    });
  });

  relaxNodes(sorted);
  return sorted;
}

export function buildGraph(memories: Memory[], entities: Entity[]): GraphModel {
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();
  const keywordMap = new Map<string, Set<string>>();
  const daily = new Map<string, number>();
  const wordCache = new Map<string, Set<string>>();

  for (const entity of entities) {
    addNode(nodes, {
      id: scopeId(entity.type, entity.id),
      label: labelFor(entity.id, 24),
      type: entity.type,
      weight: Math.max(entity.total_memories, 1),
    });
  }

  for (const memory of memories) {
    const memoryId = `memory:${memory.id}`;
    const textWords = wordsFor(memory);
    const uniqueWords = new Set(textWords);
    wordCache.set(memory.id, uniqueWords);
    daily.set(memoryDate(memory), (daily.get(memoryDate(memory)) || 0) + 1);

    addNode(nodes, {
      id: memoryId,
      label: labelFor(memory.memory || "Untitled memory", 42),
      type: "memory",
      weight: 2 + Math.min(uniqueWords.size / 8, 8),
      memory,
    });

    for (const [type, value] of [
      ["user", memory.user_id],
      ["agent", memory.agent_id],
      ["run", memory.run_id],
    ] as Array<[GraphNodeType, string | undefined]>) {
      if (!value) continue;
      const id = scopeId(type, value);
      addNode(nodes, { id, label: labelFor(value, 24), type, weight: 2 });
      addLink(links, {
        id: `${memoryId}->${id}`,
        source: memoryId,
        target: id,
        type: "scope",
        weight: 2,
      });
    }

    for (const keyword of [...uniqueWords].slice(0, 8)) {
      if (!keywordMap.has(keyword)) keywordMap.set(keyword, new Set());
      keywordMap.get(keyword)!.add(memory.id);
    }
  }

  const keywordCounts = [...keywordMap.entries()]
    .map(([keyword, ids]) => ({ keyword, count: ids.size }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 18);

  for (const { keyword, count } of keywordCounts.slice(0, 12)) {
    const keywordId = `keyword:${keyword}`;
    addNode(nodes, {
      id: keywordId,
      label: keyword,
      type: "keyword",
      weight: count,
    });
    for (const memoryId of keywordMap.get(keyword) || []) {
      addLink(links, {
        id: `${keywordId}->memory:${memoryId}`,
        source: keywordId,
        target: `memory:${memoryId}`,
        type: "keyword",
        weight: Math.min(count, 5),
      });
    }
  }

  const sample = memories.slice(0, 180);
  for (let i = 0; i < sample.length; i += 1) {
    for (let j = i + 1; j < Math.min(sample.length, i + 22); j += 1) {
      const left = wordCache.get(sample[i].id) || new Set<string>();
      const right = wordCache.get(sample[j].id) || new Set<string>();
      const shared = [...left].filter((word) => right.has(word));
      if (shared.length < 3) continue;
      addLink(links, {
        id: `memory:${sample[i].id}<->memory:${sample[j].id}`,
        source: `memory:${sample[i].id}`,
        target: `memory:${sample[j].id}`,
        type: "similar",
        weight: Math.min(shared.length, 6),
      });
    }
  }

  const degree = new Map<string, number>();
  for (const link of links.values()) {
    degree.set(link.source, (degree.get(link.source) || 0) + 1);
    degree.set(link.target, (degree.get(link.target) || 0) + 1);
  }
  const linkedMemoryIds = new Set(
    [...links.values()].flatMap((link) => [link.source, link.target]),
  );
  const typeMap = new Map<string, number>();
  for (const memory of memories) {
    const type =
      typeof memory.metadata?.type === "string" && memory.metadata.type.trim()
        ? memory.metadata.type.trim()
        : "uncategorized";
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
  }
  const entityCounts = NODE_ORDER.reduce(
    (acc, type) => ({ ...acc, [type]: 0 }),
    {} as Record<GraphNodeType, number>,
  );
  for (const node of nodes.values()) entityCounts[node.type] += 1;

  const placedNodes = placeNodes([...nodes.values()], keywordCounts);
  const connectedMemories = memories.filter((memory) => linkedMemoryIds.has(`memory:${memory.id}`)).length;
  const maxDegree = Math.max(...placedNodes.map((node) => degree.get(node.id) || 0), 0);
  const averageDegree = placedNodes.length
    ? Number((placedNodes.reduce((sum, node) => sum + (degree.get(node.id) || 0), 0) / placedNodes.length).toFixed(1))
    : 0;

  return {
    nodes: placedNodes,
    links: [...links.values()],
    bounds: graphBounds(placedNodes),
    keywordCounts,
    dailyCounts: [...daily.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14),
    entityCounts,
    isolatedMemories: memories.filter((memory) => !linkedMemoryIds.has(`memory:${memory.id}`)).length,
    connectedMemories,
    averageMemoryLength: memories.length
      ? Math.round(memories.reduce((sum, memory) => sum + (memory.memory?.length || 0), 0) / memories.length)
      : 0,
    maxDegree,
    averageDegree,
    typeCounts: [...typeMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
      .slice(0, 10),
  };
}

export function nodeColor(type: GraphNodeType) {
  return {
    memory: "#f7e9bd",
    user: "#7dd3fc",
    agent: "#fda4af",
    run: "#c4b5fd",
    keyword: "#bef264",
  }[type];
}

export function linkColor(type: GraphLink["type"]) {
  return {
    scope: "rgba(125, 211, 252, 0.42)",
    keyword: "rgba(190, 242, 100, 0.30)",
    similar: "rgba(247, 233, 189, 0.22)",
  }[type];
}
