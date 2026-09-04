import { useCallback, useEffect, useState, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
  type OnEdgesChange,
  type Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkflow, saveWorkflow, type WorkflowNodeData, type WorkflowEdgeData } from "@/lib/api/sets";
import { getTemplates } from "@/lib/api/templates";
import { RecordNode } from "./workflow/RecordNode";
import { TemplateNode } from "./workflow/TemplateNode";
import { DestinationNode } from "./workflow/DestinationNode";
import { DeleteNode } from "./workflow/DeleteNode";

const nodeTypes: NodeTypes = {
  record: RecordNode,
  template: TemplateNode,
  destination: DestinationNode,
  delete: DeleteNode,
};

// Connection rules
const NODE_RULES: Record<string, { maxInputs: number; maxOutputs: number; validTargets: string[] }> = {
  record: { maxInputs: 0, maxOutputs: 2, validTargets: ["template", "destination", "delete"] },
  template: { maxInputs: 1, maxOutputs: 99, validTargets: ["destination"] },
  destination: { maxInputs: 99, maxOutputs: 0, validTargets: [] },
  delete: { maxInputs: 0, maxOutputs: 99, validTargets: ["destination"] },
};

function isValidConnection(connection: Connection, nodes: Node[]): boolean {
  if (!connection.source || !connection.target) return false;
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;

  const rules = NODE_RULES[sourceNode.type as string];
  if (!rules) return false;

  // Check type compatibility
  if (!rules.validTargets.includes(targetNode.type as string)) return false;

  return true;
}

interface WorkflowCanvasProps {
  setId: number;
}

export function WorkflowCanvas({ setId }: WorkflowCanvasProps) {
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: workflowData, isLoading } = useQuery({
    queryKey: ["workflow", setId],
    queryFn: () => getWorkflow(setId),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => getTemplates(),
  });

  const templates = useMemo(() => templatesData?.templates ?? [], [templatesData]);

  // Convert DB nodes to React Flow nodes
  useEffect(() => {
    if (!workflowData) return;
    const flowNodes: Node[] = workflowData.nodes.map((n) => ({
      id: n.nodeId,
      type: n.type,
      position: { x: n.positionX, y: n.positionY },
      data: {
        label: n.label,
        config: n.config ? JSON.parse(n.config) : {},
        templates,
      },
    }));

    // If no nodes exist, add the default Record node
    if (flowNodes.length === 0) {
      flowNodes.push({
        id: "record",
        type: "record",
        position: { x: 50, y: 200 },
        data: { label: "Record", config: {}, templates },
      });
    }

    setNodes(flowNodes);

    const flowEdges: Edge[] = workflowData.edges.map((e) => ({
      id: e.edgeId,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    setEdges(flowEdges);
  }, [workflowData, templates, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // Validate connection rules
      if (!isValidConnection(connection, nodes)) return;

      // Count existing inputs on target
      const targetInputs = edges.filter((e) => e.target === connection.target).length;
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode) {
        const rules = NODE_RULES[targetNode.type as string];
        if (rules && targetInputs >= rules.maxInputs) return;
      }

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      );
    },
    [nodes, edges, setEdges],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => {
        const next = [...eds];
        for (const change of changes) {
          if (change.type === "remove") {
            const idx = next.findIndex((e) => e.id === change.id);
            if (idx !== -1) next.splice(idx, 1);
          }
        }
        return next;
      });
    },
    [setEdges],
  );

  const addNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      const id = `${type}_${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position,
        data: { label: type.charAt(0).toUpperCase() + type.slice(1), config: {}, templates },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [templates, setNodes],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges],
  );

  // Save workflow
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const dbNodes: WorkflowNodeData[] = nodes.map((n) => ({
        nodeId: n.id,
        type: (n.type as string) as WorkflowNodeData["type"],
        label: (n.data as any).label,
        positionX: Math.round(n.position.x),
        positionY: Math.round(n.position.y),
        config: JSON.stringify((n.data as any).config ?? {}),
      }));

      const dbEdges: WorkflowEdgeData[] = edges.map((e) => ({
        edgeId: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }));

      await saveWorkflow(setId, dbNodes, dbEdges);
      void queryClient.invalidateQueries({ queryKey: ["workflow", setId] });
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, setId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border bg-muted/20">
        <p className="text-sm text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => addNode("template", { x: 300, y: 100 })}
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            + Template
          </button>
          <button
            onClick={() => addNode("destination", { x: 300, y: 300 })}
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            + Destination
          </button>
          <button
            onClick={() => addNode("delete", { x: 50, y: 350 })}
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            + Delete
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save workflow"}
        </button>
      </div>
      <div className="h-[500px] rounded-lg border bg-muted/10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          deleteKeyCode={["Backspace", "Delete"]}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            if (confirm(`Remove ${node.type} node?`)) {
              removeNode(node.id);
            }
          }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
