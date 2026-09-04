import { apiFetch } from "./core";

export interface Template {
  id: number;
  userId: number;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateUploadResponse {
  message: string;
  filename: string;
  fields: string[];
}

export async function getTemplates(): Promise<{ success: true; templates: Template[] }> {
  return apiFetch<{ success: true; templates: Template[] }>("/api/template");
}

export async function uploadTemplate(file: File): Promise<TemplateUploadResponse> {
  const formData = new FormData();
  formData.append("template", file);

  const response = await fetch(`/api/template/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : response.statusText;
    throw new Error(message);
  }

  return data as TemplateUploadResponse;
}

export async function getTemplateFields(filename: string): Promise<{ success: true; fields: string[] }> {
  return apiFetch<{ success: true; fields: string[] }>(`/api/template/fields/${encodeURIComponent(filename)}`);
}

export interface TemplateVersion {
  id: number;
  version: number;
  note: string | null;
  createdAt: string;
}

export async function getTemplateVersions(
  name: string,
): Promise<{ success: true; versions: TemplateVersion[] }> {
  return apiFetch<{ success: true; versions: TemplateVersion[] }>(
    `/api/template/${encodeURIComponent(name)}/versions`,
  );
}

export async function updateTemplate(
  name: string,
  content: string,
  note?: string,
): Promise<{ success: true; version: number; updatedAt: string }> {
  return apiFetch<{ success: true; version: number; updatedAt: string }>(
    `/api/template/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      body: JSON.stringify(note ? { content, note } : { content }),
    },
  );
}

export async function restoreTemplateVersion(
  name: string,
  version: number,
): Promise<{ success: true; restoredVersion: number; updatedAt: string }> {
  return apiFetch<{ success: true; restoredVersion: number; updatedAt: string }>(
    `/api/template/${encodeURIComponent(name)}/versions/${version}/restore`,
    { method: "POST" },
  );
}
