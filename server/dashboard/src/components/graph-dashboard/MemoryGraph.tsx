"use client";

import { useMemo, useState } from "react";
import { Search, ZoomIn, ZoomOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GraphBounds, GraphModel, GraphNode } from "./types";
import { linkColor, nodeColor } from "./graph-utils";
import { cn } from "@/lib/utils";

interface MemoryGraphProps {
  graph: GraphModel;
  selectedNodeId: string;
  onSelectNode: (node: GraphNode) => void;
}

function nodeRadius(node: GraphNode) {
  const base = node.type === "memory" ? 4.5 : node.type === "keyword" ? 8 : 11;
  return base + Math.min(Math.sqrt(node.weight) * 1.7, 11);
}

function typeLabel(type: GraphNode["type"]) {
  return type === "memory" ? "memory" : type;
}

function boundsFor(nodes: GraphNode[], fallback: GraphBounds) {
  if (nodes.length === 0) return fallback;
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

export function MemoryGraph({ graph, selectedNodeId, onSelectNode }: MemoryGraphProps) {
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return { nodes: graph.nodes, links: graph.links };

    const nodeIds = new Set(
      graph.nodes
        .filter((node) => {
          const memory = node.memory?.memory || "";
          return `${node.label} ${node.type} ${memory}`.toLowerCase().includes(needle);
        })
        .map((node) => node.id),
    );

    for (const link of graph.links) {
      if (nodeIds.has(link.source) || nodeIds.has(link.target)) {
        nodeIds.add(link.source);
        nodeIds.add(link.target);
      }
    }

    return {
      nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
      links: graph.links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target)),
    };
  }, [graph, query]);

  const nodeById = useMemo(
    () => new Map(visible.nodes.map((node) => [node.id, node])),
    [visible.nodes],
  );

  const selectedNeighbors = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ids = new Set([selectedNodeId]);
    for (const link of visible.links) {
      if (link.source === selectedNodeId) ids.add(link.target);
      if (link.target === selectedNodeId) ids.add(link.source);
    }
    return ids;
  }, [selectedNodeId, visible.links]);

  const visibleBounds = boundsFor(visible.nodes, graph.bounds);
  const padding = 230 / zoom;
  const width = Math.max(960, visibleBounds.maxX - visibleBounds.minX + padding * 2);
  const height = Math.max(640, visibleBounds.maxY - visibleBounds.minY + padding * 2);
  const centerX = (visibleBounds.minX + visibleBounds.maxX) / 2 + pan.x;
  const centerY = (visibleBounds.minY + visibleBounds.maxY) / 2 + pan.y;
  const viewBox = `${centerX - width / (2 * zoom)} ${centerY - height / (2 * zoom)} ${width / zoom} ${height / zoom}`;

  return (
    <section className="relative h-[calc(100vh-10.5rem)] min-h-[640px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#080b0d] shadow-[0_30px_120px_rgba(0,0,0,0.45)] xl:h-full xl:min-h-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(190,242,100,0.16),transparent_26%),radial-gradient(circle_at_76%_18%,rgba(125,211,252,0.14),transparent_22%),linear-gradient(135deg,rgba(247,233,189,0.08),transparent_40%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="absolute left-5 right-5 top-5 z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[min(620px,calc(100%-9rem))] rounded-3xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-lime-200/70">
            Memory atlas
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-stone-50 md:text-5xl">
            Your second brain map
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            {visible.nodes.length} visible nodes · drag to pan · zoom into clusters
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 p-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.55, value - 0.15))}
            className="grid size-9 place-items-center rounded-full text-stone-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Zoom out"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="w-12 text-center font-mono text-xs text-stone-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(2.4, value + 0.15))}
            className="grid size-9 place-items-center rounded-full text-stone-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Zoom in"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-5 left-5 z-10 w-[min(460px,calc(100%-2.5rem))] rounded-2xl border border-white/10 bg-black/50 p-3 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memories, entities, keywords..."
            className="h-11 rounded-xl border-white/10 bg-white/[0.06] pl-10 text-stone-100 placeholder:text-stone-500"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-stone-400">
          {(["memory", "user", "agent", "run", "keyword"] as const).map((type) => (
            <span key={type} className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: nodeColor(type) }} />
              {typeLabel(type)}
            </span>
          ))}
        </div>
      </div>

      <svg
        className="absolute inset-0 size-full cursor-grab active:cursor-grabbing"
        viewBox={viewBox}
        onMouseDown={(event) => setDragStart({ x: event.clientX, y: event.clientY })}
        onMouseLeave={() => setDragStart(null)}
        onMouseUp={() => setDragStart(null)}
        onMouseMove={(event) => {
          if (!dragStart) return;
          const scale = width / Math.max(event.currentTarget.clientWidth, 1) / zoom;
          setPan((value) => ({
            x: value.x - (event.clientX - dragStart.x) * scale,
            y: value.y - (event.clientY - dragStart.y) * scale,
          }));
          setDragStart({ x: event.clientX, y: event.clientY });
        }}
      >
        <defs>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g>
          {visible.links.map((link) => {
            const source = nodeById.get(link.source);
            const target = nodeById.get(link.target);
            if (!source || !target) return null;
            const active = selectedNeighbors.size === 0 || (selectedNeighbors.has(source.id) && selectedNeighbors.has(target.id));
            return (
              <line
                key={link.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={linkColor(link.type)}
                strokeWidth={Math.max(0.65, link.weight * (active ? 0.35 : 0.14))}
                opacity={active ? 0.7 : 0.08}
              />
            );
          })}
        </g>
        <g>
          {visible.nodes.map((node) => {
            const active = selectedNeighbors.size === 0 || selectedNeighbors.has(node.id);
            const selected = selectedNodeId === node.id;
            const important = node.type !== "memory" || selected || (active && selectedNeighbors.size > 0);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className="cursor-pointer"
                opacity={active ? 1 : 0.16}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node);
                }}
              >
                <circle
                  r={nodeRadius(node) + (selected ? 9 : 0)}
                  fill={selected ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)"}
                />
                <circle
                  r={nodeRadius(node)}
                  fill={nodeColor(node.type)}
                  filter="url(#nodeGlow)"
                  className={cn("transition", selected && "stroke-white")}
                  strokeWidth={selected ? 2.2 : 0}
                />
                {important && (
                  <text
                    y={nodeRadius(node) + 17}
                    textAnchor="middle"
                    className="select-none fill-stone-100 text-[10px] font-medium tracking-tight"
                  >
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {visible.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-center text-stone-400">
          <div>
            <p className="text-lg text-stone-100">No nodes match this search.</p>
            <p className="mt-1 text-sm">Try a broader term or clear the filter.</p>
          </div>
        </div>
      )}
    </section>
  );
}
