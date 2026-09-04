import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export const DeleteNode = memo(function DeleteNode(_props: NodeProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10",
        "border-l-4 border-l-red-500"
      )}
    >
      <div className="text-sm font-medium text-card-foreground">Delete</div>
      <div className="mt-0.5 text-xs text-muted-foreground">Record removed</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-red-500 !bg-red-500/20"
      />
    </div>
  );
});
