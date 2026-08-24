import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  createAiSession,
  getAiKeyStatus,
  saveTemplate,
  sendMessage,
  storeAiKey,
  updateAiSessionModel,
  validateHtml,
  AI_MODELS,
  ApiError,
} from "@/lib/api";

export const Route = createFileRoute("/ai")({ component: AiTemplatePage });

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  html?: string;
}

function useAutoScroll<T extends HTMLElement>(deps: React.DependencyList) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, deps);
  return ref;
}

function wrapHtmlForPreview(html: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: white;
      }
      *, *::before, *::after { box-sizing: border-box; }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

function AiTemplatePage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const chatEndRef = useAutoScroll<HTMLDivElement>([messages]);

  const {
    data: keyStatus,
    isLoading: keyStatusLoading,
    refetch: refetchKeyStatus,
  } = useQuery({
    queryKey: ["ai-key-status"],
    queryFn: getAiKeyStatus,
  });

  const setupKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      storeAiKey(provider, apiKey),
    onSuccess: () => {
      void refetchKeyStatus();
    },
  });

  const sendMutation = useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: number; text: string }) =>
      sendMessage(sessionId, text),
  });

  const createSessionMutation = useMutation({
    mutationFn: () => createAiSession(),
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setSelectedModel(data.model ?? "");
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(error instanceof ApiError ? error.message : "Failed to create chat session");
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: ({ sessionId, model }: { sessionId: number; model: string }) =>
      updateAiSessionModel(sessionId, model),
    onSuccess: (data) => {
      setSelectedModel(data.model ?? "");
    },
  });

  function handleModelChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const model = event.target.value;
    setSelectedModel(model);
    if (sessionId !== null) {
      void updateModelMutation.mutateAsync({ sessionId, model });
    }
  }

  useEffect(() => {
    if (keyStatus?.configured && sessionId === null) {
      void createSessionMutation.mutateAsync();
    }
  }, [keyStatus, sessionId, createSessionMutation]);

  const latestHtml = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.html) return messages[i].html;
    }
    return "";
  }, [messages]);

  async function handleSetupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const provider = String(formData.get("provider") ?? "openai");
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    if (!apiKey) return;
    await setupKeyMutation.mutateAsync({ provider, apiKey });
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sessionId === null) {
      if (sessionId === null) {
        setSaveError("Chat session is not ready yet.");
      }
      return;
    }

    setInput("");
    setSaveError(null);
    setSaveSuccess(null);
    setValidationErrors([]);

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const data = await sendMutation.mutateAsync({ sessionId, text });
      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.text?.trim() || data.response?.trim() || "Generated a template for you.",
        html: data.html,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to get a response";
      setSaveError(message);
    }
  }

  async function handleValidateCurrentHtml() {
    if (!latestHtml) return;
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const result = await validateHtml(latestHtml);
      setValidationErrors(result.errors);
      if (!result.valid) {
        setSaveError("HTML validation failed");
      }
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "Failed to validate HTML");
    }
  }

  async function handleSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!latestHtml || !saveName) return;
    setSaveError(null);
    setSaveSuccess(null);
    setValidationErrors([]);

    try {
      const validation = await validateHtml(latestHtml);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        setSaveError("HTML validation failed. Fix the issues before saving.");
        return;
      }

      await saveTemplate({ html: latestHtml, name: saveName });
      setSaveSuccess(`Template "${saveName}" saved successfully.`);
      setSaveName("");
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "Failed to save template");
    }
  }

  const isReady = !keyStatusLoading && keyStatus?.configured;
  const isSending = sendMutation.isPending;

  return (
    <div className="flex h-svh flex-col gap-4 bg-background p-4 text-foreground md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">AI Template Studio</h1>
          <p className="text-sm text-muted-foreground">
            Generate and refine HTML templates with AI.
          </p>
        </div>
        {keyStatus && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              keyStatus.configured
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            }`}
          >
            {keyStatus.configured
              ? `AI key configured (${keyStatus.provider ?? "openai"})`
              : "No AI key configured"}
          </span>
        )}
      </header>

      {!isReady && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Connect your AI provider</CardTitle>
            <CardDescription>
              Your API key is stored encrypted on the server and used only for your
              requests.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSetupSubmit}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="provider" className="text-sm font-medium">
                  Provider
                </label>
                <select
                  id="provider"
                  name="provider"
                  defaultValue="openai"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="apiKey" className="text-sm font-medium">
                  API Key
                </label>
                <input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  required
                  placeholder="sk-..."
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {setupKeyMutation.isError && (
                <p className="text-sm text-destructive">
                  {setupKeyMutation.error instanceof Error
                    ? setupKeyMutation.error.message
                    : "Failed to save API key"}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={setupKeyMutation.isPending}>
                {setupKeyMutation.isPending ? "Saving..." : "Save API Key"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {isReady && (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Chat</CardTitle>
                  <CardDescription>
                    Describe the template you want. The AI returns HTML and you can
                    refine it conversationally.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="model" className="text-xs font-medium text-muted-foreground">
                    Model
                  </label>
                  <select
                    id="model"
                    value={selectedModel}
                    onChange={handleModelChange}
                    disabled={sessionId === null}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Server default</option>
                    {AI_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <div
                ref={chatEndRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-3"
              >
                {createSessionMutation.isError && (
                  <div className="self-center rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {saveError ?? "Could not create session"}
                  </div>
                )}
                {messages.length === 0 && !createSessionMutation.isError && (
                  <p className="text-sm text-muted-foreground">
                    Start by describing the template you want to generate.
                  </p>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] ${
                      message.role === "user" ? "self-end" : "self-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card text-foreground ring-1 ring-foreground/10 rounded-bl-md"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. A LinkedIn banner with the company name..."
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isSending}
                />
                <Button type="submit" disabled={isSending || !input.trim() || sessionId === null}>
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardHeader>
              <CardTitle>Live Preview</CardTitle>
              <CardDescription>
                The generated HTML renders in a sandboxed iframe below.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-white ring-1 ring-foreground/10">
                {latestHtml ? (
                  <iframe
                    title="AI template preview"
                    sandbox=""
                    srcDoc={wrapHtmlForPreview(latestHtml)}
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Send a message to generate a preview.
                  </div>
                )}
              </div>
              <form onSubmit={handleSaveTemplate} className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="linkedin-banner.html"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button type="submit" disabled={!latestHtml || !saveName.trim()}>
                    Save Template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleValidateCurrentHtml}
                    disabled={!latestHtml}
                  >
                    Validate
                  </Button>
                </div>
                {(saveError || saveSuccess) && (
                  <div
                    className={`rounded-md px-3 py-2 text-sm ${
                      saveError
                        ? "bg-destructive/10 text-destructive"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    }`}
                  >
                    {saveError ?? saveSuccess}
                  </div>
                )}
                {validationErrors.length > 0 && (
                  <ul className="list-disc rounded-md bg-destructive/10 px-5 py-2 text-sm text-destructive">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
