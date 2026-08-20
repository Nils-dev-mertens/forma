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
