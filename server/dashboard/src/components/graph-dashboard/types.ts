import { Entity, Memory } from "@/types/api";

export type GraphNodeType = "memory" | "user" | "agent" | "run" | "keyword";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  weight: number;
  memory?: Memory;
  x: number;
  y: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: "scope" | "keyword" | "similar";
  weight: number;
}

export interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GraphModel {
  nodes: GraphNode[];
  links: GraphLink[];
  bounds: GraphBounds;
  keywordCounts: Array<{ keyword: string; count: number }>;
  dailyCounts: Array<{ day: string; count: number }>;
  entityCounts: Record<GraphNodeType, number>;
  isolatedMemories: number;
  averageMemoryLength: number;
}

export interface DashboardData {
  memories: Memory[];
  entities: Entity[];
}
