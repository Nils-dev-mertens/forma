import { db } from "./client.ts";
import {
  workflowNodes,
  workflowEdges,
  workflowRuns,
  workflowNodeResults,
  type WorkflowNode,
  type NewWorkflowNode,
  type WorkflowEdge,
  type NewWorkflowEdge,
  type WorkflowRun,
  type WorkflowNodeResult,
} from "./schema.ts";
import { eq, desc } from "drizzle-orm";

// ---------- Node operations ----------

export async function upsertWorkflowNodes(
  setId: number,
  nodes: NewWorkflowNode[],
): Promise<WorkflowNode[]> {
  // Delete existing nodes for this set and insert new ones (full replace).
  await db.delete(workflowNodes).where(eq(workflowNodes.setId, setId));
  if (nodes.length === 0) return [];
  const result = await db
    .insert(workflowNodes)
    .values(nodes.map((n) => ({ ...n, setId })))
    .returning();
  return result;
}

export async function getWorkflowNodes(setId: number): Promise<WorkflowNode[]> {
  return db
    .select()
    .from(workflowNodes)
    .where(eq(workflowNodes.setId, setId))
    .orderBy(workflowNodes.id);
}

// ---------- Edge operations ----------

export async function upsertWorkflowEdges(
  setId: number,
  edges: NewWorkflowEdge[],
): Promise<WorkflowEdge[]> {
  await db.delete(workflowEdges).where(eq(workflowEdges.setId, setId));
  if (edges.length === 0) return [];
  const result = await db
    .insert(workflowEdges)
    .values(edges.map((e) => ({ ...e, setId })))
    .returning();
  return result;
}

export async function getWorkflowEdges(setId: number): Promise<WorkflowEdge[]> {
  return db
    .select()
    .from(workflowEdges)
    .where(eq(workflowEdges.setId, setId))
    .orderBy(workflowEdges.id);
}

// ---------- Run operations ----------

export async function createWorkflowRun(
  setId: number,
  event: string,
  entryId?: number,
): Promise<WorkflowRun> {
  // Delete any existing run for this set (latest run only).
  await db.delete(workflowRuns).where(eq(workflowRuns.setId, setId));
  const result = await db
    .insert(workflowRuns)
    .values({ setId, event, entryId })
    .returning();
  return result[0]!;
}

export async function completeWorkflowRun(
  runId: number,
  status: string,
): Promise<WorkflowRun | null> {
  const result = await db
    .update(workflowRuns)
    .set({ status, completedAt: new Date() })
    .where(eq(workflowRuns.id, runId))
    .returning();
  return result[0] ?? null;
}

export async function getLatestWorkflowRun(
  setId: number,
): Promise<WorkflowRun | null> {
  const result = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.setId, setId))
    .orderBy(desc(workflowRuns.startedAt))
    .limit(1);
  return result[0] ?? null;
}

// ---------- Node result operations ----------

export async function createNodeResult(
  runId: number,
  nodeId: string,
  type: string,
): Promise<WorkflowNodeResult> {
  const result = await db
    .insert(workflowNodeResults)
    .values({ runId, nodeId, type })
    .returning();
  return result[0]!;
}

export async function updateNodeResult(
  id: number,
  patch: {
    status?: string;
    payload?: string;
    response?: string;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
  },
): Promise<WorkflowNodeResult | null> {
  const result = await db
    .update(workflowNodeResults)
    .set(patch)
    .where(eq(workflowNodeResults.id, id))
    .returning();
  return result[0] ?? null;
}

export async function getNodeResults(
  runId: number,
): Promise<WorkflowNodeResult[]> {
  return db
    .select()
    .from(workflowNodeResults)
    .where(eq(workflowNodeResults.runId, runId))
    .orderBy(workflowNodeResults.id);
}
