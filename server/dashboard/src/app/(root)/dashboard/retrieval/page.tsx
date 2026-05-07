"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { api } from "@/utils/api";
import { MEMORY_ENDPOINTS } from "@/utils/api-endpoints";
import {
  MemorySearchRequest,
  MemorySearchResponse,
  MemorySearchResult,
} from "@/types/api";

const DEFAULT_TOP_K = "10";
const DEFAULT_THRESHOLD = "0.1";
const EMPTY_RESULTS: MemorySearchResult[] = [];

interface SearchDiagnostics {
  payload: MemorySearchRequest;
  durationMs: number;
  resultCount: number;
  searchedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeResults(raw: MemorySearchResponse | MemorySearchResult[] | unknown): MemorySearchResult[] {
  if (Array.isArray(raw)) return raw as MemorySearchResult[];
  if (isRecord(raw) && Array.isArray(raw.results)) return raw.results as MemorySearchResult[];
  return EMPTY_RESULTS;
}

function resultScore(result: MemorySearchResult) {
  const raw = (result as unknown as Record<string, unknown>).score;
  return typeof raw === "number" ? raw : undefined;
}

function explanationFor(result: MemorySearchResult) {
  const direct = result.explanation || result.reason || result.why_matched;
  if (direct) return { label: "Server explanation", text: direct };

  const metadata = result.metadata || {};
  for (const key of ["explanation", "reason", "why_matched"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return { label: "Metadata explanation", text: value };
    }
  }

  return undefined;
}

function queryTerms(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 2),
    ),
  ).slice(0, 8);
}

function literalMatches(query: string, memory: string) {
  const text = memory.toLowerCase();
  return queryTerms(query).filter((term) => text.includes(term));
}

function metadataEntries(metadata: Record<string, unknown> | undefined) {
  return Object.entries(metadata || {}).filter(([, value]) => value !== undefined && value !== null);
}

function matchingEntityBadges(result: MemorySearchResult, filters: Record<string, unknown> | undefined) {
  if (!filters) return [];
  return ["user_id", "agent_id", "run_id"].flatMap((key) => {
    const expected = filters[key];
    const actual = (result as unknown as Record<string, unknown>)[key];
    if (!expected || !actual) return [];
    return String(expected) === String(actual) ? [`${key} matched`] : [`${key} differs`];
  });
}

function visibleMetadataMatches(result: MemorySearchResult, filters: Record<string, unknown> | undefined) {
  if (!filters || !result.metadata) return [];
  return Object.entries(filters)
    .filter(([key]) => !["user_id", "agent_id", "run_id"].includes(key))
    .flatMap(([key, expected]) => {
      if (!(key in result.metadata!)) return [];
      const actual = result.metadata![key];
      return JSON.stringify(actual) === JSON.stringify(expected) ? [`metadata.${key} matched`] : [];
    });
}

function buildHint(result: MemorySearchResult, query: string, filters: Record<string, unknown> | undefined) {
  const explicit = explanationFor(result);
  if (explicit) return explicit;

  const terms = literalMatches(query, result.memory || "");
  const entityMatches = matchingEntityBadges(result, filters);
  const metadataMatches = visibleMetadataMatches(result, filters);
  const hints = [
    terms.length ? `contains query terms: ${terms.join(", ")}` : "likely semantic/vector match",
    ...entityMatches,
    ...metadataMatches,
  ];

  return {
    label: "Client hint",
    text: `${hints.join("; ")}. Backend did not return scoring components or a server explanation.`,
  };
}

export default function RetrievalInspectorPage() {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("marcos");
  const [agentId, setAgentId] = useState("");
  const [runId, setRunId] = useState("");
  const [topK, setTopK] = useState(DEFAULT_TOP_K);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [filtersJson, setFiltersJson] = useState("");
  const [results, setResults] = useState<MemorySearchResult[]>(EMPTY_RESULTS);
  const [diagnostics, setDiagnostics] = useState<SearchDiagnostics | null>(null);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const filtersWarning = useMemo(
    () => !userId.trim() && !agentId.trim() && !runId.trim() && !filtersJson.trim(),
    [agentId, filtersJson, runId, userId],
  );

  const buildPayload = (): MemorySearchRequest => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) throw new Error("Enter a search query first.");

    const filters: Record<string, unknown> = {};
    if (filtersJson.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(filtersJson);
      } catch {
        throw new Error("Additional filters must be valid JSON.");
      }
      if (!isRecord(parsed)) throw new Error("Additional filters must be a JSON object.");
      Object.assign(filters, parsed);
    }

    if (userId.trim()) filters.user_id = userId.trim();
    if (agentId.trim()) filters.agent_id = agentId.trim();
    if (runId.trim()) filters.run_id = runId.trim();

    const payload: MemorySearchRequest = { query: trimmedQuery };
    if (Object.keys(filters).length > 0) payload.filters = filters;

    if (topK.trim()) {
      const value = Number(topK);
      if (!Number.isInteger(value) || value < 1) throw new Error("top_k must be a positive integer.");
      payload.top_k = value;
    }

    if (threshold.trim()) {
      const value = Number(threshold);
      if (!Number.isFinite(value)) throw new Error("threshold must be a number.");
      payload.threshold = value;
    }

    return payload;
  };

  const handleSearch = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    setError("");
    setIsSearching(true);

    try {
      const payload = buildPayload();
      const startedAt = performance.now();
      const response = await api.post<MemorySearchResponse | MemorySearchResult[]>(
        MEMORY_ENDPOINTS.SEARCH,
        payload,
      );
      const durationMs = Math.round(performance.now() - startedAt);
      const normalized = normalizeResults(response.data);

      setResults(normalized);
      setDiagnostics({
        payload,
        durationMs,
        resultCount: normalized.length,
        searchedAt: new Date().toLocaleString(),
      });
    } catch (searchError) {
      setResults(EMPTY_RESULTS);
      setError(getErrorMessage(searchError, "Search failed"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setAgentId("");
    setRunId("");
    setTopK(DEFAULT_TOP_K);
    setThreshold(DEFAULT_THRESHOLD);
    setFiltersJson("");
    setResults(EMPTY_RESULTS);
    setDiagnostics(null);
    setError("");
  };

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold font-fustat">Retrieval Inspector</h1>
          <p className="mt-1 max-w-2xl text-sm text-onSurface-default-tertiary">
            Test memory search queries, inspect the exact payload sent to POST /search, and review returned scores,
            metadata, and match hints.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full px-3 py-1 text-onSurface-default-tertiary">
          Local self-hosted Mem0
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,520px)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4" />
              Search query
            </CardTitle>
            <CardDescription>Entity filters are sent inside the filters object for predictable scoping.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSearch}>
              <Textarea
                label="Query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void handleSearch(event);
                }}
                placeholder="Which deployment decisions were made for J2900?"
                textareaClassName="min-h-28"
              />

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="retrieval-user-id">User ID</Label>
                  <Input
                    id="retrieval-user-id"
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    placeholder="marcos"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="retrieval-agent-id">Agent ID</Label>
                  <Input
                    id="retrieval-agent-id"
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    placeholder="claude-code"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="retrieval-run-id">Run ID</Label>
                  <Input
                    id="retrieval-run-id"
                    value={runId}
                    onChange={(event) => setRunId(event.target.value)}
                    placeholder="optional"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="retrieval-top-k">top_k</Label>
                  <Input
                    id="retrieval-top-k"
                    inputMode="numeric"
                    value={topK}
                    onChange={(event) => setTopK(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="retrieval-threshold">threshold</Label>
                  <Input
                    id="retrieval-threshold"
                    inputMode="decimal"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                  />
                </div>
              </div>

              <Textarea
                label="Additional filters JSON"
                value={filtersJson}
                onChange={(event) => setFiltersJson(event.target.value)}
                placeholder={'{\n  "metadata_key": "value"\n}'}
                textareaClassName="min-h-24 font-mono text-xs"
              />

              {filtersWarning && (
                <div className="flex gap-2 rounded-lg border border-amber-200/30 bg-amber-200/10 p-3 text-xs text-amber-700 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Unscoped searches can be noisy. Add a user, agent, run, or metadata filter when possible.
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSearching}>
                  {isSearching ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
                  Search
                </Button>
                <Button type="button" variant="outline" onClick={handleClear} disabled={isSearching}>
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4" />
              Diagnostics
            </CardTitle>
            <CardDescription>What the dashboard sent and what the backend returned.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Endpoint" value="POST /search" />
              <Metric label="Results" value={diagnostics?.resultCount ?? "--"} />
              <Metric label="Duration" value={diagnostics ? `${diagnostics.durationMs}ms` : "--"} />
              <Metric label="Searched" value={diagnostics?.searchedAt ?? "--"} />
            </div>

            <div className="rounded-lg border border-memBorder-primary bg-surface-default-secondary p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-onSurface-default-tertiary">
                <Info className="size-3.5" />
                Current backend limitation
              </div>
              <p className="text-sm text-onSurface-default-secondary">
                The server returns final results and metadata. It does not expose semantic/BM25 score breakdowns,
                rejected candidates, or filter pass/fail traces yet.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Effective payload</Label>
              <pre className="max-h-80 overflow-auto rounded-lg bg-surface-default-secondary p-3 text-xs text-onSurface-default-secondary">
                {diagnostics ? prettyJson(diagnostics.payload) : "Run a search to inspect the payload."}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Results</h2>
          <span className="text-sm text-onSurface-default-tertiary">
            {diagnostics ? `${diagnostics.resultCount} memories returned` : "No search run yet"}
          </span>
        </div>

        {diagnostics && results.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-onSurface-default-tertiary">
              No memories matched this query and filter combination.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {results.map((result, index) => {
              const score = resultScore(result);
              const hint = buildHint(result, query, diagnostics?.payload.filters);
              const entries = metadataEntries(result.metadata);
              return (
                <Card key={result.id || `${index}-${result.memory}`} className="overflow-hidden">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="rounded-full">Rank {index + 1}</Badge>
                        {typeof score === "number" && (
                          <Badge variant="outline" className="rounded-full">Score {score.toFixed(4)}</Badge>
                        )}
                        {result.user_id && <Badge variant="outline">user: {result.user_id}</Badge>}
                        {result.agent_id && <Badge variant="outline">agent: {result.agent_id}</Badge>}
                        {result.run_id && <Badge variant="outline">run: {result.run_id}</Badge>}
                      </div>
                      <span className="text-xs text-onSurface-default-tertiary">
                        {result.updated_at || result.created_at
                          ? new Date(result.updated_at || result.created_at || "").toLocaleString()
                          : "undated"}
                      </span>
                    </div>

                    <p className="text-sm leading-6 text-onSurface-default-primary">{result.memory}</p>

                    <div className="rounded-lg border border-memBorder-primary bg-surface-default-secondary p-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-onSurface-default-tertiary">
                        {hint.label}
                      </p>
                      <p className="text-sm text-onSurface-default-secondary">{hint.text}</p>
                    </div>

                    {entries.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs text-onSurface-default-tertiary">Metadata</Label>
                        <div className="flex flex-wrap gap-2">
                          {entries.slice(0, 8).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="max-w-full font-mono font-normal">
                              {key}: {safeString(value)}
                            </Badge>
                          ))}
                          {entries.length > 8 && <Badge variant="outline">+{entries.length - 8} more</Badge>}
                        </div>
                      </div>
                    )}

                    <details className="rounded-lg border border-memBorder-primary bg-surface-default-secondary p-3">
                      <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-onSurface-default-tertiary">
                        Raw result JSON
                      </summary>
                      <pre className="mt-3 max-h-96 overflow-auto text-xs text-onSurface-default-secondary">
                        {prettyJson(result)}
                      </pre>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-memBorder-primary bg-surface-default-secondary p-3">
      <p className="text-xs text-onSurface-default-tertiary">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-onSurface-default-primary">{value}</p>
    </div>
  );
}
