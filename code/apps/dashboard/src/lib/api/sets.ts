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

export interface Set {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  fields: SetField[];
  templates: string[];
  triggers: SetTriggers;
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: number;
  setId: number;
  data: Record<string, unknown>;
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
    description?: string | null;
    fields?: SetField[];
    templates?: string[];
    triggers?: SetTriggers;
  },
): Promise<{ success: true; set: Set }> {
  return apiFetch<{ success: true; set: Set }>(`/api/set/${setId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSet(setId: number): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/set/${setId}`, {
    method: "DELETE",
  });
}

export async function getEntries(setId: number): Promise<{ success: true; entries: Entry[] }> {
  return apiFetch<{ success: true; entries: Entry[] }>(`/api/set/${setId}/entry`);
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
