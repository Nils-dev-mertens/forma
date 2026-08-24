import { apiFetch, ApiError } from "./api/core";

export { ApiError };

export interface ApiKeyStatus {
  configured: boolean;
  provider?: string;
}

export interface SaveTemplateRequest {
  html: string;
  name: string;
}

export interface SaveTemplateResponse {
  success: true;
  template: {
    id: number;
    name: string;
    content: string;
    userId: number;
    createdAt: number | Date;
    updatedAt: number | Date;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ChatMessageResponse {
  success: true;
  response: string;
  html: string;
  text?: string;
}

export interface SessionResponse {
  success: true;
  sessionId: number;
  model?: string | null;
}

export interface AiSessionResponse {
  success: true;
  session: {
    id: number;
    userId: number;
    contextTemplateName: string | null;
    model: string | null;
    createdAt: number | Date;
    updatedAt: number | Date;
  };
  messages: Array<{
    id: number;
    role: string;
    content: string;
    createdAt: number | Date;
  }>;
}

// Curated, provider-safe model choices offered in the UI. Keep in sync with
// SUPPORTED_MODELS in apps/api/src/services/ai/provider.ts.
export const AI_MODELS: string[] = [
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4.5-preview",
  "o3-mini",
  "o1-mini",
  "o3",
  "o1",
  "o3-pro",
];

export async function getAiKeyStatus(): Promise<ApiKeyStatus> {
  return apiFetch<ApiKeyStatus>("/api/ai/key");
}

export async function storeAiKey(provider: string, apiKey: string): Promise<{ success: true; provider: string }> {
  return apiFetch<{ success: true; provider: string }>("/api/ai/key", {
    method: "POST",
    body: JSON.stringify({ provider, apiKey }),
  });
}

export async function createAiSession(contextTemplateName?: string, model?: string | null): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/ai/session", {
    method: "POST",
    body: JSON.stringify(
      contextTemplateName ? { contextTemplateName, model } : model ? { model } : {},
    ),
  });
}

export async function getAiSession(sessionId: number): Promise<AiSessionResponse> {
  return apiFetch<AiSessionResponse>(`/api/ai/session/${sessionId}`);
}

export async function updateAiSessionModel(sessionId: number, model: string): Promise<{ success: true; model: string }> {
  return apiFetch<{ success: true; model: string }>(`/api/ai/session/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ model }),
  });
}

export interface AiLog {
  id: number;
  userId: number;
  sessionId: number | null;
  provider: string;
  model: string;
  system: string | null;
  prompt: string | null;
  response: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export async function getAiLogs(): Promise<{ success: true; logs: AiLog[] }> {
  return apiFetch<{ success: true; logs: AiLog[] }>("/api/ai/logs");
}

export async function sendMessage(sessionId: number, text: string): Promise<ChatMessageResponse> {
  return apiFetch<ChatMessageResponse>(`/api/ai/session/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function validateHtml(html: string): Promise<ValidationResult> {
  return apiFetch<ValidationResult>("/api/ai/validate-html", {
    method: "POST",
    body: JSON.stringify({ html }),
  });
}

export async function saveTemplate(request: SaveTemplateRequest): Promise<SaveTemplateResponse> {
  return apiFetch<SaveTemplateResponse>("/api/ai/save-template", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
