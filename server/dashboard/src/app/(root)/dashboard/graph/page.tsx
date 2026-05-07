"use client";

import { useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemoryGraph } from "@/components/graph-dashboard/MemoryGraph";
import { StatsPanel } from "@/components/graph-dashboard/StatsPanel";
import { buildGraph } from "@/components/graph-dashboard/graph-utils";
import { GraphNode } from "@/components/graph-dashboard/types";
import { useApiQuery } from "@/hooks/use-api-query";
import { api } from "@/utils/api";
import { ENTITY_ENDPOINTS, MEMORY_ENDPOINTS } from "@/utils/api-endpoints";
import { Entity, Memory } from "@/types/api";

interface GraphDashboardPayload {
  memories: Memory[];
  entities: Entity[];
  errors: string[];
}

const EMPTY_MEMORIES: Memory[] = [];
const EMPTY_ENTITIES: Entity[] = [];
const EMPTY_ERRORS: string[] = [];

function normalizeMemories(raw: unknown): Memory[] {
  const maybeResults = raw as { results?: unknown };
  const rows = Array.isArray(maybeResults?.results) ? maybeResults.results : raw;
  return Array.isArray(rows) ? (rows as Memory[]) : [];
}

export default function GraphDashboardPage() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | undefined>();

  const { data, isLoading, refetch } = useApiQuery<GraphDashboardPayload>(
    async () => {
      const [memoriesResult, entitiesResult] = await Promise.allSettled([
        api.get(MEMORY_ENDPOINTS.BASE),
        api.get<Entity[]>(ENTITY_ENDPOINTS.BASE),
      ]);

      const errors: string[] = [];
      const memories =
        memoriesResult.status === "fulfilled"
          ? normalizeMemories(memoriesResult.value.data)
          : EMPTY_MEMORIES;
      const entities =
        entitiesResult.status === "fulfilled" ? entitiesResult.value.data ?? EMPTY_ENTITIES : EMPTY_ENTITIES;

      if (memoriesResult.status === "rejected") errors.push("Memories endpoint failed.");
      if (entitiesResult.status === "rejected") errors.push("Entities endpoint failed.");

      return { memories, entities, errors };
    },
    {
      initialData: { memories: EMPTY_MEMORIES, entities: EMPTY_ENTITIES, errors: EMPTY_ERRORS },
    },
  );

  const memories = data?.memories ?? EMPTY_MEMORIES;
  const entities = data?.entities ?? EMPTY_ENTITIES;
  const graph = useMemo(() => buildGraph(memories, entities), [memories, entities]);
  const selectedStillExists = selectedNode
    ? graph.nodes.find((node) => node.id === selectedNode.id)
    : undefined;

  return (
    <main className="min-h-[calc(100vh-7.5rem)] rounded-[2.4rem] bg-[#050708] p-3 text-stone-50 md:p-4 xl:h-[calc(100vh-7.5rem)] xl:overflow-hidden">
      <div className="grid gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="shrink-0 rounded-3xl border border-white/10 bg-[#0b0f10] px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-stone-500">
                  Local self-hosted Mem0
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-stone-100">
                  Graph dashboard
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {isLoading && (
                  <span className="font-mono text-xs uppercase tracking-[0.22em] text-lime-200/70">
                    syncing
                  </span>
                )}
                <Button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded-full border border-white/10 bg-white/[0.06] text-stone-100 hover:bg-white/[0.12]"
                  variant="ghost"
                >
                  <RefreshCcw className="mr-2 size-4" />
                  Refresh graph
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <MemoryGraph
              graph={graph}
              selectedNodeId={selectedStillExists?.id || ""}
              onSelectNode={setSelectedNode}
            />
          </div>
        </div>

        <StatsPanel
          graph={graph}
          selectedNode={selectedStillExists}
          totalMemories={memories.length}
          totalEntities={entities.length}
          errors={data?.errors ?? EMPTY_ERRORS}
        />
      </div>
    </main>
  );
}
