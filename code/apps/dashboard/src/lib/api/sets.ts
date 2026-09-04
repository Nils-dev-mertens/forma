import { apiFetch } from "./core";

export interface SetField {
  fieldname: string;
  type: string;
  required?: boolean;
}

export interface TriggerAction {
  template: string;
  widthPx: number;
  heightPx: number;
}

export interface SetTriggers {
  add: TriggerAction[];
  modify: TriggerAction[];
}

export type HookType = "webhook" | "email";
export type HookEvent = "add" | "modify";

/** A hook as returned by the API (config decrypted, secrets masked). */
export interface DisplayHook {
  id: string;
  type: HookType;
  events: HookEvent[];
  config: Record<string, unknown>;
  configured: boolean;
}

/** A hook as submitted to the API (plaintext config). */
export interface SetHook {
  id: string;
  type: HookType;
  events: HookEvent[];
  config: Record<string, unknown>;
}

export interface Set {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  fields: SetField[];
  templates: string[];
  triggers: SetTriggers;
  hooks: DisplayHook[];
  createdAt: string;
  updatedAt: string;
}

export interface EntryImage {
  name: string;
  template?: string;
  generationData?: string;
}

export interface Entry {
  id: number;
  setId: number;
  data: Record<string, unknown>;
  images?: EntryImage[];
  createdAt: string;
  updatedAt: string;
}

export async function getSets(): Promise<{ success: true; sets: Set[] }> {
  return apiFetch<{ success: true; sets: Set[] }>("/api/set");
}

export async function getSet(setId: number): Promise<{ success: true; set: Set; unusedTemplates: string[] }> {
  return apiFetch<{ success: true; set: Set; unusedTemplates: string[] }>(`/api/set/${setId}`);
}

export async function createSet(payload: {
  name: string;
  description?: string;
  fields: SetField[];
  templates: string[];
  triggers?: SetTriggers;
}): Promise<{ success: true; set: Set }> {
  return apiFetch<{ success: true; set: Set }>("/api/set", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSet(
  setId: number,
  payload: {
    name?: string;
    description?: string | null;
    fields?: SetField[];
    templates?: string[];
    triggers?: SetTriggers;
    hooks?: SetHook[];
  },
): Promise<{ success: true; set: Set }> {
  return apiFetch<{ success: true; set: Set }>(`/api/set/${setId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function testHook(
  setId: number,
  hook: SetHook,
): Promise<{ success: true; delivered: boolean; error?: string }> {
  return apiFetch<{ success: true; delivered: boolean; error?: string }>(
    `/api/set/${setId}/hooks/test`,
    {
      method: "POST",
      body: JSON.stringify({ hook }),
    },
  );
}

export async function deleteSet(setId: number): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/set/${setId}`, {
    method: "DELETE",
  });
}

export async function getEntries(
  setId: number,
  options?: { withImages?: boolean },
): Promise<{ success: true; entries: Entry[] }> {
  const query = options?.withImages ? "?withImages=true" : "";
  return apiFetch<{ success: true; entries: Entry[] }>(
    `/api/set/${setId}/entry${query}`,
  );
}

export async function createEntry(
  setId: number,
  data: Record<string, unknown>,
): Promise<{ success: true; entry: Entry }> {
  return apiFetch<{ success: true; entry: Entry }>(`/api/set/${setId}/entry`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export async function updateEntry(
  setId: number,
  entryId: number,
  data: Record<string, unknown>,
): Promise<{ success: true; entry: Entry }> {
  return apiFetch<{ success: true; entry: Entry }>(`/api/set/${setId}/entry/${entryId}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

export async function deleteEntry(setId: number, entryId: number): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/set/${setId}/entry/${entryId}`, {
    method: "DELETE",
  });
}

// ---------- Workflow Canvas ----------

export interface WorkflowNodeData {
  nodeId: string;
  type: "record" | "template" | "destination" | "delete";
  label?: string;
  positionX: number;
  positionY: number;
  config: string; // JSON string
}

export interface WorkflowEdgeData {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowRun {
  id: number;
  setId: number;
  entryId: number | null;
  event: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export interface WorkflowNodeResult {
  id: number;
  runId: number;
  nodeId: string;
  type: string;
  status: string;
  payload: string | null;
  response: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export async function getWorkflow(
  setId: number,
): Promise<{ success: true; nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }> {
  return apiFetch(`/api/set/${setId}/workflow`);
}

export async function saveWorkflow(
  setId: number,
  nodes: WorkflowNodeData[],
  edges: WorkflowEdgeData[],
): Promise<{ success: true; nodes: WorkflowNodeData[]; edges: WorkflowEdgeData[] }> {
  return apiFetch(`/api/set/${setId}/workflow`, {
    method: "PUT",
    body: JSON.stringify({ nodes, edges }),
  });
}

export async function getWorkflowRun(
  setId: number,
): Promise<{ success: true; run: WorkflowRun | null; nodeResults: WorkflowNodeResult[] }> {
  return apiFetch(`/api/set/${setId}/workflow/run`);
}
