import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export const DestinationNode = memo(function DestinationNode({ data }: NodeProps) {
  const config = (data as any).config ?? {};
  const type = config.type ?? "webhook";
  const label = type === "webhook" ? "Webhook" : type === "email" ? "Email" : type === "s3" ? "S3/GCS" : "Destination";

  return (
    <div className="rounded-lg border-2 border-orange-500 bg-orange-50 px-4 py-3 shadow-md">
      <div className="text-xs font-semibold text-orange-700">{label}</div>
      <div className="mt-1 text-[10px] text-orange-600">
        {config.url ? new URL(config.url).hostname : "Not configured"}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-orange-500"
      />
    </div>
  );
});
