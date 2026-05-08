"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Layers3, ListTree, Search, Sparkles, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GraphBounds, GraphModel, GraphNode } from "./types";
import { linkColor, nodeColor } from "./graph-utils";
import { cn } from "@/lib/utils";

interface MemoryGraphProps {
  graph: GraphModel;
  selectedNodeId: string;
  onSelectNode: (node?: GraphNode) => void;
}

type ViewMode = "map" | "focus" | "timeline" | "concepts";

const VIEW_MODES: Array<{ id: ViewMode; label: string; icon: LucideIcon }> = [
  { id: "map", label: "Atlas", icon: Layers3 },
  { id: "focus", label: "Neighborhood", icon: ListTree },
  { id: "timeline", label: "Timeline", icon: ListTree },
  { id: "concepts", label: "Concepts", icon: Sparkles },
];

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nodeDate(node: GraphNode) {
  return node.memory?.updated_at || node.memory?.created_at || "";
}

function memoryPreview(node: GraphNode) {
  return (node.memory?.memory || node.label).replace(/\s+/g, " ").trim();
}

export function MemoryGraph({ graph, selectedNodeId, onSelectNode }: MemoryGraphProps) {
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const containerRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

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

  const degree = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of visible.links) {
      map.set(link.source, (map.get(link.source) || 0) + 1);
      map.set(link.target, (map.get(link.target) || 0) + 1);
    }
    return map;
  }, [visible.links]);

  const dense = visible.nodes.length > 420 || visible.links.length > 900;
  const renderLinks = useMemo(() => {
    const links = selectedNodeId
      ? visible.links.filter((link) => link.source === selectedNodeId || link.target === selectedNodeId)
      : visible.links;
    if (!dense || selectedNodeId || query.trim()) return links;
    return [...links]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 850);
  }, [dense, query, selectedNodeId, visible.links]);

  const memoryNodes = useMemo(
    () => visible.nodes.filter((node) => node.type === "memory" && node.memory),
    [visible.nodes],
  );

  const focusNodes = useMemo(() => {
    const source = selectedNeighbors.size > 0
      ? visible.nodes.filter((node) => selectedNeighbors.has(node.id))
      : visible.nodes;
    return [...source]
      .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || b.weight - a.weight)
      .slice(0, 24);
  }, [degree, selectedNeighbors, visible.nodes]);

  const timelineNodes = useMemo(
    () => [...memoryNodes].sort((a, b) => nodeDate(b).localeCompare(nodeDate(a))).slice(0, 42),
    [memoryNodes],
  );

  const visibleBounds = boundsFor(visible.nodes, graph.bounds);
  const padding = 230 / zoom;
  const width = Math.max(960, visibleBounds.maxX - visibleBounds.minX + padding * 2);
  const height = Math.max(640, visibleBounds.maxY - visibleBounds.minY + padding * 2);
  const centerX = (visibleBounds.minX + visibleBounds.maxX) / 2 + pan.x;
  const centerY = (visibleBounds.minY + visibleBounds.maxY) / 2 + pan.y;
  const viewBox = `${centerX - width / (2 * zoom)} ${centerY - height / (2 * zoom)} ${width / zoom} ${height / zoom}`;

  const changeZoom = useCallback((delta: number) => {
    setZoom((value) => clamp(Number((value + delta).toFixed(2)), 0.45, 3.2));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom(event.deltaY > 0 ? -0.12 : 0.12);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [changeZoom]);

  const handleDrag = useCallback((event: MouseEvent<SVGSVGElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;
    const scale = width / Math.max(event.currentTarget.clientWidth, 1) / zoom;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    draggedRef.current = true;
    setPan((value) => ({ x: value.x - dx * scale, y: value.y - dy * scale }));
    dragStartRef.current = { x: event.clientX, y: event.clientY };
  }, [width, zoom]);

  return (
    <section ref={containerRef} className="relative h-[calc(100vh-10.5rem)] min-h-[640px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#080b0d] shadow-[0_30px_120px_rgba(0,0,0,0.45)] xl:h-full xl:min-h-0">
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
            {visible.nodes.length} visible nodes · {renderLinks.length} rendered links · Ctrl + scroll to zoom
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/45 p-1.5 backdrop-blur-xl">
            {VIEW_MODES.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setViewMode(view.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-2 text-xs transition",
                    viewMode === view.id
                      ? "bg-lime-200 text-stone-950"
                      : "text-stone-400 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" />
                  {view.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 p-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => changeZoom(-0.15)}
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
              onClick={() => changeZoom(0.15)}
              className="grid size-9 place-items-center rounded-full text-stone-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 left-5 z-10 w-[min(520px,calc(100%-2.5rem))] rounded-2xl border border-white/10 bg-black/50 p-3 backdrop-blur-xl">
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
          {dense && (
            <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.08] px-2.5 py-1 text-amber-100">
              dense mode: strongest links shown
            </span>
          )}
        </div>
      </div>

      {viewMode === "map" && (
        <svg
          className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
          viewBox={viewBox}
          onClick={() => {
            if (!draggedRef.current) {
              onSelectNode(undefined);
            }
          }}
          onMouseDown={(event) => {
            draggedRef.current = false;
            dragStartRef.current = { x: event.clientX, y: event.clientY };
          }}
          onMouseLeave={() => {
            dragStartRef.current = null;
          }}
          onMouseUp={() => {
            dragStartRef.current = null;
          }}
          onMouseMove={handleDrag}
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
            {renderLinks.map((link) => {
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
                  strokeWidth={Math.max(0.55, link.weight * (active ? 0.32 : 0.11))}
                  opacity={active ? 0.62 : 0.06}
                />
              );
            })}
          </g>
          <g>
            {visible.nodes.map((node) => {
              const active = selectedNeighbors.size === 0 || selectedNeighbors.has(node.id);
              const selected = selectedNodeId === node.id;
              const connected = (degree.get(node.id) || 0) > 0;
              const important = node.type !== "memory" || selected || (active && selectedNeighbors.size > 0);
              const showLabel = important || zoom >= 2.15 || (!dense && connected && zoom >= 1.25);
              const showPreview = node.type === "memory" && (selected || zoom >= 2.65);
              const preview = memoryPreview(node);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  className="cursor-pointer"
                  opacity={active ? 1 : 0.15}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectNode(node);
                  }}
                >
                  <circle
                    r={nodeRadius(node) + (selected ? 9 : 0)}
                    fill={selected ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.04)"}
                  />
                  <circle
                    r={nodeRadius(node)}
                    fill={nodeColor(node.type)}
                    filter={dense ? undefined : "url(#nodeGlow)"}
                    className={cn("transition", selected && "stroke-white")}
                    strokeWidth={selected ? 2.2 : 0}
                  />
                  {showLabel && (
                    <text
                      y={nodeRadius(node) + 17}
                      textAnchor="middle"
                      className="select-none fill-stone-100 text-[10px] font-medium tracking-tight"
                    >
                      <tspan x={0}>{node.label}</tspan>
                      {showPreview && preview !== node.label && (
                        <tspan x={0} dy={13} className="fill-stone-300 text-[8px] font-normal">
                          {preview.slice(0, 72)}{preview.length > 72 ? "…" : ""}
                        </tspan>
                      )}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {viewMode === "focus" && (
        <div className="absolute inset-x-5 bottom-28 top-36 overflow-y-auto rounded-[1.7rem] border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {focusNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectNode(node)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-lime-200/30 hover:bg-lime-200/[0.06]"
              >
                <span className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                  <span className="size-2 rounded-full" style={{ backgroundColor: nodeColor(node.type) }} />
                  {node.type} · {degree.get(node.id) || 0} links
                </span>
                <span className="line-clamp-3 text-sm leading-6 text-stone-100">
                  {node.memory?.memory || node.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === "timeline" && (
        <div className="absolute inset-x-5 bottom-28 top-36 overflow-y-auto rounded-[1.7rem] border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
          <div className="space-y-3">
            {timelineNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectNode(node)}
                className="grid w-full gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-sky-200/30 hover:bg-sky-200/[0.06] md:grid-cols-[118px_minmax(0,1fr)]"
              >
                <span className="font-mono text-xs text-sky-100/80">
                  {(nodeDate(node) || "undated").slice(0, 10)}
                </span>
                <span className="line-clamp-2 text-sm leading-6 text-stone-100">
                  {node.memory?.memory || node.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === "concepts" && (
        <div className="absolute inset-x-5 bottom-28 top-36 overflow-y-auto rounded-[1.7rem] border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {graph.keywordCounts.slice(0, 18).map((item, index) => (
              <div key={item.keyword} className="rounded-2xl border border-lime-200/10 bg-lime-200/[0.05] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lime-200/50">
                  concept {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-lime-50">
                  {item.keyword}
                </p>
                <p className="mt-2 text-sm text-stone-400">{item.count} linked memories</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
