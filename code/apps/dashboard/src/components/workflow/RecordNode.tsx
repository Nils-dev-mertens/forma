import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export const RecordNode = memo(function RecordNode(_props: NodeProps) {
  return (
    <div className="rounded-lg border-2 border-blue-500 bg-blue-50 px-4 py-3 shadow-md">
      <div className="text-xs font-semibold text-blue-700">Record</div>
      <div className="mt-1 text-[10px] text-blue-600">New / Edited</div>
      <Handle
        type="source"
        position={Position.Right}
        id="new"
        className="!h-3 !w-3 !bg-green-500"
        title="New entry"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="edited"
        className="!top-auto !h-3 !w-3 !bg-yellow-500"
        title="Edited entry"
        style={{ bottom: -6 }}
      />
    </div>
  );
});
