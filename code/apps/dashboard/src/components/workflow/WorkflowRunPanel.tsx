import { useQuery } from "@tanstack/react-query";
import { getWorkflowRun, type WorkflowNodeResult } from "@/lib/api/sets";

interface WorkflowRunPanelProps {
  setId: number;
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-700",
  skipped: "bg-gray-100 text-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  success: "Success",
  partial: "Partial (some nodes failed)",
  failed: "Failed",
  pending: "Pending",
  skipped: "Skipped",
};

export function WorkflowRunPanel({ setId }: WorkflowRunPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["workflowRun", setId],
    queryFn: () => getWorkflowRun(setId),
    refetchInterval: (query) => {
      // Auto-refresh while run is in progress
      const run = query.state.data?.run;
      if (run && run.status === "running") return 2000;
      return false;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Loading run history...</p>
      </div>
    );
  }

  const run = data?.run;
  const nodeResults = data?.nodeResults ?? [];

  if (!run) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">No runs yet. Add or edit an entry to trigger the workflow.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h4 className="font-medium">Latest Run</h4>
          <p className="text-xs text-muted-foreground">
            {run.event} · {new Date(run.startedAt).toLocaleString()}
            {run.completedAt && ` → ${new Date(run.completedAt).toLocaleString()}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[run.status] ?? ""}`}>
          {STATUS_LABELS[run.status] ?? run.status}
        </span>
      </div>

      {nodeResults.length > 0 && (
        <div className="p-4">
          <h5 className="mb-2 text-sm font-medium">Node Results</h5>
          <div className="flex flex-col gap-2">
            {nodeResults.map((result) => (
              <NodeResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeResultCard({ result }: { result: WorkflowNodeResult }) {
  const statusColor = STATUS_COLORS[result.status] ?? "";
  const payload = result.payload ? JSON.parse(result.payload) : null;
  const response = result.response ? JSON.parse(result.response) : null;

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{result.nodeId}</span>
          <span className="text-xs text-muted-foreground">({result.type})</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>
          {result.status}
        </span>
      </div>

      {result.error && (
        <p className="mt-1 text-xs text-destructive">{result.error}</p>
      )}

      {payload && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Payload
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      )}

      {response && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Response
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">
            {JSON.stringify(response, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
