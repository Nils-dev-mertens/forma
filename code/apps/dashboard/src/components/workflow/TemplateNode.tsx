import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export const TemplateNode = memo(function TemplateNode({ data }: NodeProps) {
  const config = (data as any).config ?? {};
  const label = (data as any).label ?? "Template";
  const templateName = config.templateName ?? "Select template";
  const width = config.widthPx ?? 1200;
  const height = config.heightPx ?? 800;

  return (
    <div
      className={cn(
        "relative rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10",
        "border-l-4 border-l-purple-500"
      )}
    >
      <div className="text-sm font-medium text-card-foreground">{label}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{templateName}</div>
      <div className="text-xs text-muted-foreground/70">
        {width}×{height}px
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-purple-500 !bg-purple-500/20"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-purple-500 !bg-purple-500/20"
      />
    </div>
  );
});
