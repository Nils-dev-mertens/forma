import { useQuery } from "@tanstack/react-query";
import { getWorkflowRun, type WorkflowNodeResult } from "@/lib/api/sets";
import { cn } from "@/lib/utils";

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
      const run = query.state.data?.run;
      if (run && run.status === "running") return 2000;
      return false;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl ring-1 ring-foreground/10 p-4">
        <p className="text-sm text-muted-foreground">Loading run history...</p>
      </div>
    );
  }

  const run = data?.run;
  const nodeResults = data?.nodeResults ?? [];

  if (!run) {
    return (
      <div className="rounded-xl ring-1 ring-foreground/10 p-4">
        <p className="text-sm text-muted-foreground">No runs yet. Add or edit an entry to trigger the workflow.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h4 className="text-sm font-medium">Latest Run</h4>
          <p className="text-xs text-muted-foreground">
            {run.event} · {new Date(run.startedAt).toLocaleString()}
            {run.completedAt && ` → ${new Date(run.completedAt).toLocaleString()}`}
          </p>
        </div>
        <span className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-medium",
          STATUS_COLORS[run.status]
        )}>
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
  const isOk = result.status === "success";

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            isOk ? "bg-green-500" : "bg-red-500"
          )}
        />
        <span className="font-medium">{result.type}</span>
        <span className="text-xs text-muted-foreground">({result.nodeId})</span>
      </div>
      <div className="text-right">
        {result.error && (
          <span className="text-xs text-red-500">{result.error}</span>
        )}
      </div>
    </div>
  );
}
