import { Router, type Response, type Request } from "express";
import { logger } from "@repo/logger";
import {
  getSetById,
  upsertWorkflowNodes,
  upsertWorkflowEdges,
  getWorkflowNodes,
  getWorkflowEdges,
  getLatestWorkflowRun,
  getNodeResults,
  type Set,
} from "@repo/db";

const router: Router = Router();

function requireUserId(res: Response): number | undefined {
  return (res.locals as any).user?.id;
}

function parseIntParam(value: string): number | undefined {
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

async function assertOwnership(
  userId: number,
  setId: number,
): Promise<{ ok: true; set: Set } | { ok: false; status: number; message: string }> {
  const set = await getSetById(setId);
  if (!set) return { ok: false, status: 404, message: "Set not found" };
  if (set.userId !== userId) return { ok: false, status: 403, message: "Forbidden" };
  return { ok: true, set };
}

// --- Validation helpers ---

const VALID_NODE_TYPES = new Set(["record", "template", "destination", "delete"]);
const VALID_EVENT_HANDLES = new Set(["new", "edited"]);

function validateNode(node: any): string | null {
  if (!node || typeof node !== "object") return "every node must be an object";
  if (typeof node.nodeId !== "string" || node.nodeId.trim() === "") return "node needs a non-empty nodeId";
  if (typeof node.type !== "string" || !VALID_NODE_TYPES.has(node.type)) {
    return `node ${node.nodeId}: invalid type "${node.type}" (expected record, template, destination, or delete)`;
  }
  if (typeof node.positionX !== "number") return `node ${node.nodeId}: positionX must be a number`;
  if (typeof node.positionY !== "number") return `node ${node.nodeId}: positionY must be a number`;
  if (node.config !== undefined && typeof node.config !== "string") {
    return `node ${node.nodeId}: config must be a JSON string`;
  }
  return null;
}

function validateEdge(edge: any, nodeIds: Set<string>): string | null {
  if (!edge || typeof edge !== "object") return "every edge must be an object";
  if (typeof edge.edgeId !== "string" || edge.edgeId.trim() === "") return "edge needs a non-empty edgeId";
  if (typeof edge.sourceNodeId !== "string" || !nodeIds.has(edge.sourceNodeId)) {
    return `edge ${edge.edgeId}: sourceNodeId "${edge.sourceNodeId}" not found in nodes`;
  }
  if (typeof edge.targetNodeId !== "string" || !nodeIds.has(edge.targetNodeId)) {
    return `edge ${edge.edgeId}: targetNodeId "${edge.targetNodeId}" not found in nodes`;
  }
  if (edge.sourceHandle !== undefined && edge.sourceHandle !== null && typeof edge.sourceHandle !== "string") {
    return `edge ${edge.edgeId}: sourceHandle must be a string`;
  }
  return null;
}

// --- Connection rules ---

interface NodeTypeInfo {
  maxInputs: number;
  maxOutputs: number;
  validTargets: string[]; // node types this can connect TO
}

const NODE_RULES: Record<string, NodeTypeInfo> = {
  record:     { maxInputs: 0, maxOutputs: 2, validTargets: ["template", "destination", "delete"] },
  template:   { maxInputs: 2, maxOutputs: 99, validTargets: ["destination"] },
  destination: { maxInputs: 99, maxOutputs: 0, validTargets: [] },
  delete:     { maxInputs: 0, maxOutputs: 99, validTargets: ["destination"] },
};

function validateConnectionRules(
  nodes: Array<{ nodeId: string; type: string }>,
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
): string | null {
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n.type]));
  const inputCounts = new Map<string, number>();
  const outputCounts = new Map<string, number>();

  for (const edge of edges) {
    // Check type compatibility
    const sourceType = nodeMap.get(edge.sourceNodeId);
    const targetType = nodeMap.get(edge.targetNodeId);
    if (!sourceType || !targetType) continue; // already validated

    const rules = NODE_RULES[sourceType];
    if (!rules) return `unknown source type: ${sourceType}`;
    if (!rules.validTargets.includes(targetType)) {
      return `cannot connect ${sourceType} → ${targetType}`;
    }

    // Count inputs/outputs
    outputCounts.set(edge.sourceNodeId, (outputCounts.get(edge.sourceNodeId) ?? 0) + 1);
    inputCounts.set(edge.targetNodeId, (inputCounts.get(edge.targetNodeId) ?? 0) + 1);
  }

  // Enforce limits
  for (const node of nodes) {
    const rules = NODE_RULES[node.type];
    if (!rules) continue;
    const inputs = inputCounts.get(node.nodeId) ?? 0;
    const outputs = outputCounts.get(node.nodeId) ?? 0;
    if (inputs > rules.maxInputs) {
      return `node ${node.nodeId} (${node.type}): too many inputs (${inputs}, max ${rules.maxInputs})`;
    }
    if (outputs > rules.maxOutputs) {
      return `node ${node.nodeId} (${node.type}): too many outputs (${outputs}, max ${rules.maxOutputs})`;
    }
  }

  return null;
}

// ---------- Routes ----------

/**
 * GET /api/set/:setId/workflow
 * Returns the workflow graph (nodes + edges) for a set.
 */
router.get("/:setId/workflow", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const ownership = await assertOwnership(userId, setId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.message });

    const nodes = await getWorkflowNodes(setId);
    const edges = await getWorkflowEdges(setId);

    return res.json({ success: true, nodes, edges });
  } catch (error) {
    logger.error({ message: "Failed to get workflow", error: error as Error });
    return res.status(500).json({ error: "Failed to get workflow" });
  }
});

/**
 * PUT /api/set/:setId/workflow
 * Full-replace save of the workflow graph (nodes + edges).
 */
router.put("/:setId/workflow", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const ownership = await assertOwnership(userId, setId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.message });

    const { nodes, edges } = req.body ?? {};
    if (!Array.isArray(nodes)) return res.status(400).json({ error: "nodes must be an array" });
    if (!Array.isArray(edges)) return res.status(400).json({ error: "edges must be an array" });

    // Validate nodes
    for (const node of nodes) {
      const err = validateNode(node);
      if (err) return res.status(400).json({ error: err });
    }

    // Validate edges
    const nodeIds = new Set(nodes.map((n: any) => n.nodeId));
    for (const edge of edges) {
      const err = validateEdge(edge, nodeIds);
      if (err) return res.status(400).json({ error: err });
    }

    // Validate connection rules
    const ruleError = validateConnectionRules(
      nodes.map((n: any) => ({ nodeId: n.nodeId, type: n.type })),
      edges.map((e: any) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
    );
    if (ruleError) return res.status(400).json({ error: ruleError });

    // Save
    const savedNodes = await upsertWorkflowNodes(
      setId,
      nodes.map((n: any) => ({
        setId,
        nodeId: n.nodeId,
        type: n.type,
        label: n.label ?? null,
        positionX: Math.round(n.positionX),
        positionY: Math.round(n.positionY),
        config: n.config ?? "{}",
      })),
    );

    const savedEdges = await upsertWorkflowEdges(
      setId,
      edges.map((e: any) => ({
        setId,
        edgeId: e.edgeId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    );

    return res.json({ success: true, nodes: savedNodes, edges: savedEdges });
  } catch (error) {
    logger.error({ message: "Failed to save workflow", error: error as Error });
    return res.status(500).json({ error: "Failed to save workflow" });
  }
});

/**
 * GET /api/set/:setId/workflow/run
 * Returns the latest run with its node results.
 */
router.get("/:setId/workflow/run", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const ownership = await assertOwnership(userId, setId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.message });

    const run = await getLatestWorkflowRun(setId);
    if (!run) return res.json({ success: true, run: null, nodeResults: [] });

    const nodeResults = await getNodeResults(run.id);
    return res.json({ success: true, run, nodeResults });
  } catch (error) {
    logger.error({ message: "Failed to get workflow run", error: error as Error });
    return res.status(500).json({ error: "Failed to get workflow run" });
  }
});

export default router;
