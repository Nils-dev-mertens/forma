import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getAiLogs, type AiLog } from "@/lib/api";

export const Route = createFileRoute("/ai-logs")({ component: AiLogsPage });

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function LogRow({ log }: { log: AiLog }) {
  const [open, setOpen] = useState(false);
  const isError = log.status === "error";

  return (
    <li className="rounded-lg border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm"
      >
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            isError
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          }`}
        >
          {log.status}
        </span>
        <span className="font-medium">{log.model}</span>
        <span className="text-muted-foreground">{log.provider}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {log.totalTokens != null ? `${log.totalTokens} tok` : "—"}
          {log.inputTokens != null ? ` (in ${log.inputTokens} / out ${log.outputTokens})` : ""}
        </span>
        <span className="w-full text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
      </button>

      {open && (
        <div className="grid gap-3 border-t px-4 py-3 text-xs">
          {log.error && (
            <div>
              <p className="mb-1 font-semibold text-destructive">Error</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2">
                {log.error}
              </pre>
            </div>
          )}
          <div>
            <p className="mb-1 font-semibold">Prompt</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2">
              {log.prompt ?? "—"}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-semibold">Response</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2">
              {log.response ?? "—"}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}

function AiLogsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-logs"],
    queryFn: getAiLogs,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">AI Logs</h1>
        <p className="text-sm text-muted-foreground">
          A record of every AI request made with your account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            Click a row to inspect the prompt and response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading logs...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load logs.</p>
          ) : data?.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI requests yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data?.logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
