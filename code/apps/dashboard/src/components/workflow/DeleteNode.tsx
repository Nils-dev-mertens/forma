import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export const DeleteNode = memo(function DeleteNode(_props: NodeProps) {
  return (
    <div className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 shadow-md">
      <div className="text-xs font-semibold text-red-700">Delete</div>
      <div className="mt-1 text-[10px] text-red-600">Record removed</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-red-500"
      />
    </div>
  );
});
