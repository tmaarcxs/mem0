"use client";

import {
  Activity,
  BrainCircuit,
  CalendarDays,
  CircleDotDashed,
  Gauge,
  Link2,
  Network,
  Sparkles,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { GraphModel, GraphNode } from "./types";
import { cn } from "@/lib/utils";

interface StatsPanelProps {
  graph: GraphModel;
  selectedNode?: GraphNode;
  totalMemories: number;
  totalEntities: number;
  errors: string[];
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f10] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
      <div className={cn("absolute -right-8 -top-8 size-24 rounded-full blur-3xl", accent)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-50">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-400">{detail}</p>
        </div>
        <div className="grid size-9 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-stone-200">
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function MiniBars({ data }: { data: Array<{ day: string; count: number }> }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="flex h-24 items-end gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-3">
      {data.length === 0 ? (
        <div className="grid h-full flex-1 place-items-center text-sm text-stone-500">
          No dated memories yet
        </div>
      ) : (
        data.map((item) => (
          <div key={item.day} className="group flex flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-full bg-gradient-to-t from-lime-300/45 to-sky-200 transition group-hover:from-lime-200 group-hover:to-white"
              style={{ height: `${Math.max(8, (item.count / max) * 70)}px` }}
            />
            <span className="font-mono text-[8px] text-stone-600">
              {item.day.slice(5)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 last:border-b-0">
      <span className="text-xs text-stone-500">{label}</span>
      <span className="font-mono text-xs text-stone-200">{value}</span>
    </div>
  );
}

export function StatsPanel({ graph, selectedNode, totalMemories, totalEntities, errors }: StatsPanelProps) {
  const linksPerMemory = totalMemories ? (graph.links.length / totalMemories).toFixed(1) : "0";
  const topKeywords = graph.keywordCounts.slice(0, 12);
  const connectedPercent = totalMemories
    ? Math.round((graph.connectedMemories / totalMemories) * 100)
    : 0;
  const strongestConcept = graph.keywordCounts[0];
  const activeDays = graph.dailyCounts.filter((item) => item.count > 0).length;

  return (
    <aside className="min-h-0 space-y-3 overflow-y-auto pr-1 xl:h-full">
      {errors.length > 0 && (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-950/30 p-4 text-sm text-amber-100">
          <p className="font-semibold">Some dashboard data could not load.</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-100/75">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <StatCard
          label="Memories"
          value={totalMemories}
          detail={`${graph.isolatedMemories} isolated · ${graph.averageMemoryLength} chars avg`}
          icon={BrainCircuit}
          accent="bg-lime-300/20"
        />
        <StatCard
          label="Connections"
          value={graph.links.length}
          detail={`${linksPerMemory} links per memory`}
          icon={Network}
          accent="bg-sky-300/20"
        />
        <StatCard
          label="Coverage"
          value={`${connectedPercent}%`}
          detail={`${graph.connectedMemories} memories connected to the atlas`}
          icon={Gauge}
          accent="bg-emerald-300/20"
        />
        <StatCard
          label="Hub strength"
          value={graph.maxDegree}
          detail={`${graph.averageDegree} average node degree`}
          icon={Link2}
          accent="bg-cyan-300/20"
        />
        <StatCard
          label="Entities"
          value={totalEntities}
          detail={`${graph.entityCounts.user} users · ${graph.entityCounts.agent} agents · ${graph.entityCounts.run} runs`}
          icon={Users}
          accent="bg-rose-300/20"
        />
        <StatCard
          label="Keywords"
          value={graph.entityCounts.keyword}
          detail={strongestConcept ? `${strongestConcept.keyword} leads the map` : "Recurring concepts inferred from text"}
          icon={Sparkles}
          accent="bg-violet-300/20"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f10] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-stone-500">
              Selected node
            </p>
            <h2 className="mt-2 max-h-16 overflow-hidden text-lg font-semibold leading-6 tracking-[-0.03em] text-stone-50">
              {selectedNode ? selectedNode.label : "Nothing selected"}
            </h2>
          </div>
          <CircleDotDashed className="mt-1 size-5 shrink-0 text-stone-500" />
        </div>
        {selectedNode?.memory ? (
          <div className="space-y-3 text-sm text-stone-300">
            <p className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-3 leading-6">
              {selectedNode.memory.memory}
            </p>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs text-stone-500">
              <span>ID</span>
              <span className="break-all font-mono text-stone-400">{selectedNode.memory.id}</span>
              <span>User</span>
              <span className="truncate font-mono text-stone-400">{selectedNode.memory.user_id || "--"}</span>
              <span>Agent</span>
              <span className="truncate font-mono text-stone-400">{selectedNode.memory.agent_id || "--"}</span>
              <span>Type</span>
              <span className="truncate font-mono text-stone-400">
                {typeof selectedNode.memory.metadata?.type === "string" ? selectedNode.memory.metadata.type : "--"}
              </span>
              <span>Updated</span>
              <span className="break-all font-mono text-stone-400">
                {selectedNode.memory.updated_at || selectedNode.memory.created_at || "--"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-500">
            Click a memory, entity, or keyword in the graph to inspect its local neighborhood.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f10] p-4">
        <div className="mb-3 flex items-center gap-2 text-stone-100">
          <Activity className="size-4" />
          <h2 className="font-semibold">Memory activity</h2>
        </div>
        <MiniBars data={graph.dailyCounts} />
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3">
          <MetricRow label="Active days shown" value={activeDays} />
          <MetricRow label="Recent peak" value={Math.max(...graph.dailyCounts.map((item) => item.count), 0)} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f10] p-4">
        <div className="mb-3 flex items-center gap-2 text-stone-100">
          <Tags className="size-4" />
          <h2 className="font-semibold">Memory categories</h2>
        </div>
        <div className="space-y-2">
          {graph.typeCounts.length === 0 ? (
            <p className="text-sm text-stone-500">No metadata categories yet.</p>
          ) : (
            graph.typeCounts.map((item) => (
              <div key={item.type} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
                <span className="truncate text-xs text-stone-300">{item.type}</span>
                <span className="font-mono text-xs text-stone-500">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f10] p-4">
        <div className="mb-3 flex items-center gap-2 text-stone-100">
          <CalendarDays className="size-4" />
          <h2 className="font-semibold">Top concepts</h2>
        </div>
        <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
          {topKeywords.length === 0 ? (
            <p className="text-sm text-stone-500">Not enough repeated concepts yet.</p>
          ) : (
            topKeywords.map((item) => (
              <span
                key={item.keyword}
                className="rounded-full border border-lime-200/10 bg-lime-200/[0.06] px-3 py-1.5 text-xs text-lime-100"
              >
                {item.keyword} · {item.count}
              </span>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
