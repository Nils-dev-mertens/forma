import { apiFetch } from "./core";

export interface PlatformTemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  widthPx: number;
  heightPx: number;
  fields: string[];
}

export interface PlatformTemplate extends PlatformTemplateSummary {
  html: string;
}

export async function getPlatformTemplates(): Promise<{
  success: true;
  templates: PlatformTemplateSummary[];
}> {
  return apiFetch<{ success: true; templates: PlatformTemplateSummary[] }>(
    "/api/platform-templates",
  );
}

export async function getPlatformTemplate(
  id: string,
): Promise<{ success: true; template: PlatformTemplate }> {
  return apiFetch<{ success: true; template: PlatformTemplate }>(
    `/api/platform-templates/${encodeURIComponent(id)}`,
  );
}
