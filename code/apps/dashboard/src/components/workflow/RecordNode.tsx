import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export const RecordNode = memo(function RecordNode(_props: NodeProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10",
        "border-l-4 border-l-blue-500"
      )}
    >
      <div className="text-sm font-medium text-card-foreground">Record</div>
      <div className="mt-0.5 text-xs text-muted-foreground">New / Edited</div>
      <Handle
        type="source"
        position={Position.Right}
        id="new"
        className="!h-3 !w-3 !rounded-full !border-2 !border-green-500 !bg-green-500/20"
        title="New entry"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="edited"
        className="!top-auto !h-3 !w-3 !rounded-full !border-2 !border-yellow-500 !bg-yellow-500/20"
        title="Edited entry"
        style={{ bottom: -6 }}
      />
    </div>
  );
});
