import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export const TemplateNode = memo(function TemplateNode({ data }: NodeProps) {
  const config = (data as any).config ?? {};
  const label = (data as any).label ?? "Template";
  const templateName = config.templateName ?? "Select template";
  const width = config.widthPx ?? 1200;
  const height = config.heightPx ?? 800;

  return (
    <div className="rounded-lg border-2 border-purple-500 bg-purple-50 px-4 py-3 shadow-md">
      <div className="text-xs font-semibold text-purple-700">{label}</div>
      <div className="mt-1 text-[10px] text-purple-600">{templateName}</div>
      <div className="text-[10px] text-purple-500">{width}x{height}px</div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-purple-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-purple-500"
      />
    </div>
  );
});
