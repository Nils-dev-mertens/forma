import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export const DestinationNode = memo(function DestinationNode({ data }: NodeProps) {
  const config = (data as any).config ?? {};
  const type = (config.type as string) ?? "webhook";
  const label =
    type === "webhook"
      ? "Webhook"
      : type === "email"
        ? "Email"
        : type === "s3"
          ? "S3 / GCS"
          : "Destination";

  return (
    <div
      className={cn(
        "relative rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10",
        "border-l-4 border-l-orange-500"
      )}
    >
      <div className="text-sm font-medium text-card-foreground">{label}</div>
      <div className="mt-0.5 max-w-[150px] truncate text-xs text-muted-foreground">
        {config.url ? new URL(config.url as string).hostname : "Not configured"}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-orange-500 !bg-orange-500/20"
      />
    </div>
  );
});
