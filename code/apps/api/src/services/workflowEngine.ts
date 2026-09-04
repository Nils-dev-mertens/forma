import {
  getWorkflowNodes,
  getWorkflowEdges,
  createWorkflowRun,
  completeWorkflowRun,
  createNodeResult,
  updateNodeResult,
  getSetById,
  decodeEntryData,
  entryDataToRecords,
  getProfileByUserId,
  profileToRecords,
  getTemplateByName,
  createImage,
  linkImageToEntry,
  decodeSetTemplates,
  type Set,
  type Entry,
  type WorkflowNode,
  type WorkflowEdge,
} from "@repo/db";
import { generateAndStoreImageFromTemplateStrict, type TemplateGenerationInput } from "@repo/generation";
import { generateRandomName } from "@repo/auth";
import { logger } from "@repo/logger";
import { imagePathToDataUrl } from "./imageDataUrls.ts";
import { fireHooks, type HookFailure } from "./hooks.ts";

interface WorkflowContext {
  userId: number;
  set: Set;
  entry: Entry;
  event: "add" | "modify" | "delete";
}

interface NodeExecutionResult {
  nodeId: string;
  type: string;
  status: "success" | "failed" | "skipped";
  payload?: unknown;
  response?: unknown;
  error?: string;
}

interface WorkflowResult {
  runId: number;
  status: "success" | "partial" | "failed";
  nodeResults: NodeExecutionResult[];
  hookFailures: HookFailure[];
}

// ---------- Graph utilities ----------

interface GraphNode {
  nodeId: string;
  type: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

interface GraphEdge {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}

/**
 * Topological sort of the workflow graph. Returns nodes in execution order,
 * grouped by layer (nodes in the same layer can run in parallel).
 */
function topologicalSort(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphNode[][] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.nodeId, 0);
    adjacency.set(node.nodeId, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const layers: GraphNode[][] = [];
  const visited = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));

  // Start with nodes that have no incoming edges (Record, Delete)
  let currentLayer = nodes.filter((n) => (inDegree.get(n.nodeId) ?? 0) === 0);

  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    for (const node of currentLayer) {
      visited.add(node.nodeId);
    }

    const nextLayer: GraphNode[] = [];
    for (const node of currentLayer) {
      for (const targetId of adjacency.get(node.nodeId) ?? []) {
        if (visited.has(targetId)) continue;
        const newDegree = (inDegree.get(targetId) ?? 1) - 1;
        inDegree.set(targetId, newDegree);
        if (newDegree === 0) {
          const targetNode = nodeMap.get(targetId);
          if (targetNode) nextLayer.push(targetNode);
        }
      }
    }
    currentLayer = nextLayer;
  }

  return layers;
}

// ---------- Node execution ----------

async function buildGenerationInput(
  entry: Entry,
  userId: number,
  widthPx: number,
  heightPx: number,
  templateName: string,
): Promise<TemplateGenerationInput> {
  const records = entryDataToRecords(decodeEntryData(entry));

  const profile = await getProfileByUserId(userId);
  if (profile) {
    const profileRecords = profileToRecords(profile);
    for (const [key, value] of Object.entries(profileRecords)) {
      records[key] = value;
    }
  }

  for (const [key, value] of Object.entries(records)) {
    if (typeof value !== "string") continue;
    try {
      const dataUrl = await imagePathToDataUrl(value);
      if (dataUrl) records[key] = dataUrl;
    } catch {
      // Soft-fail: keep original path
    }
  }

  const input: TemplateGenerationInput = {
    templatename: templateName,
    withdpx: widthPx,
    heightpx: heightPx,
    data: { records },
  };

  logger.info({
    message: "Workflow: buildGenerationInput",
    templateName,
    withdpx: input.withdpx,
    heightpx: input.heightpx,
    recordKeys: Object.keys(records),
  });

  return input;
}

async function executeTemplateNode(
  node: GraphNode,
  ctx: WorkflowContext,
): Promise<NodeExecutionResult> {
  const config = node.config;
  const templateName = config.templateName as string;
  const widthPx = (config.widthPx as number) ?? 1200;
  const heightPx = (config.heightPx as number) ?? 800;

  logger.info({
    message: "Workflow: executing template node",
    nodeId: node.nodeId,
    templateName,
    widthPx,
    heightPx,
    config,
  });

  if (!templateName) {
    return {
      nodeId: node.nodeId,
      type: "template",
      status: "skipped",
      error: "No template selected",
    };
  }

  const template = await getTemplateByName(ctx.userId, templateName);
  if (!template) {
    return {
      nodeId: node.nodeId,
      type: "template",
      status: "failed",
      error: `Template not found: ${templateName}`,
    };
  }

  const imagename = generateRandomName({ length: 12, endsWith: ".png" });

  try {
    const input = await buildGenerationInput(ctx.entry, ctx.userId, widthPx, heightPx, templateName);
    await generateAndStoreImageFromTemplateStrict(input, imagename);

    // Create image record and link to entry
    const image = await createImage(
      ctx.userId,
      template.id,
      imagename,
      {
        template: templateName,
        entryId: ctx.entry.id,
        setId: ctx.set.id,
      },
    );
    if (image) {
      await linkImageToEntry(image.id, ctx.entry.id);
    }

    return {
      nodeId: node.nodeId,
      type: "template",
      status: "success",
      payload: { templateName, widthPx, heightPx, entryId: ctx.entry.id },
      response: { imageName: imagename },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error({
      message: "Workflow: template render failed",
      nodeId: node.nodeId,
      template: templateName,
      error: reason,
    });
    return {
      nodeId: node.nodeId,
      type: "template",
      status: "failed",
      payload: { templateName, widthPx, heightPx },
      error: reason,
    };
  }
}

async function executeDestinationNode(
  node: GraphNode,
  ctx: WorkflowContext,
  renderedImages: Array<{ name: string; template: string }>,
): Promise<NodeExecutionResult> {
  const config = node.config;
  const destinationType = (config.type as string) ?? "webhook";

  try {
    // Reuse existing hook infrastructure
    const hookFailures = await fireHooks(
      { set: ctx.set, entry: { id: ctx.entry.id, data: decodeEntryData(ctx.entry) } },
      ctx.event === "delete" ? "add" : ctx.event,
      renderedImages,
    );

    return {
      nodeId: node.nodeId,
      type: "destination",
      status: hookFailures.length > 0 ? "failed" : "success",
      payload: { destinationType, config },
      response: { hookFailures },
      error: hookFailures.length > 0 ? hookFailures.map((f) => f.reason).join(", ") : undefined,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      nodeId: node.nodeId,
      type: "destination",
      status: "failed",
      payload: { destinationType },
      error: reason,
    };
  }
}

async function executeDeleteNode(
  node: GraphNode,
  ctx: WorkflowContext,
): Promise<NodeExecutionResult> {
  return {
    nodeId: node.nodeId,
    type: "delete",
    status: "success",
    payload: { entryId: ctx.entry.id, event: "delete" },
    response: { message: "Delete event triggered" },
  };
}

async function executeRecordNode(
  node: GraphNode,
  ctx: WorkflowContext,
): Promise<NodeExecutionResult> {
  return {
    nodeId: node.nodeId,
    type: "record",
    status: "success",
    payload: { entryId: ctx.entry.id, event: ctx.event },
    response: { entryData: decodeEntryData(ctx.entry) },
  };
}

// ---------- Main execution engine ----------

export async function fireWorkflow(
  ctx: WorkflowContext,
): Promise<WorkflowResult> {
  const nodes = await getWorkflowNodes(ctx.set.id);
  const edges = await getWorkflowEdges(ctx.set.id);

  // If no workflow nodes exist, fall back to legacy triggers
  if (nodes.length === 0) {
    return {
      runId: 0,
      status: "success",
      nodeResults: [],
      hookFailures: [],
    };
  }

  // Create a run record
  const run = await createWorkflowRun(ctx.set.id, ctx.event, ctx.entry.id);

  // Build graph
  const graphNodes: GraphNode[] = nodes.map((n) => ({
    nodeId: n.nodeId,
    type: n.type,
    config: n.config ? JSON.parse(n.config) : {},
    positionX: n.positionX,
    positionY: n.positionY,
  }));

  const graphEdges: GraphEdge[] = edges.map((e) => ({
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    sourceHandle: e.sourceHandle ?? undefined,
  }));

  // Topological sort
  const layers = topologicalSort(graphNodes, graphEdges);

  // Track rendered images for destination nodes
  let renderedImages: Array<{ name: string; template: string }> = [];
  const allResults: NodeExecutionResult[] = [];
  let overallStatus: "success" | "partial" | "failed" = "success";

  // Execute layer by layer
  for (const layer of layers) {
    const layerPromises = layer.map(async (node) => {
      // Create pending result
      const resultRecord = await createNodeResult(run.id, node.nodeId, node.type);
      await updateNodeResult(resultRecord.id, { status: "running", startedAt: new Date() });

      let result: NodeExecutionResult;

      switch (node.type) {
        case "record":
          result = await executeRecordNode(node, ctx);
          break;
        case "template":
          result = await executeTemplateNode(node, ctx);
          // Track rendered images
          if (result.status === "success" && result.response) {
            const resp = result.response as { imageName: string; imagePath: string };
            renderedImages.push({
              name: resp.imageName,
              template: (node.config.templateName as string) ?? "unknown",
            });
          }
          break;
        case "destination":
          result = await executeDestinationNode(node, ctx, renderedImages);
          break;
        case "delete":
          result = await executeDeleteNode(node, ctx);
          break;
        default:
          result = {
            nodeId: node.nodeId,
            type: node.type,
            status: "skipped",
            error: `Unknown node type: ${node.type}`,
          };
      }

      // Update result record
      await updateNodeResult(resultRecord.id, {
        status: result.status,
        payload: result.payload ? JSON.stringify(result.payload) : undefined,
        response: result.response ? JSON.stringify(result.response) : undefined,
        error: result.error,
        completedAt: new Date(),
      });

      return result;
    });

    // Execute layer in parallel
    const layerResults = await Promise.allSettled(layerPromises);

    for (const settled of layerResults) {
      if (settled.status === "fulfilled") {
        allResults.push(settled.value);
        if (settled.value.status === "failed") {
          overallStatus = "partial";
        }
      } else {
        // Promise rejected (shouldn't happen, but handle it)
        overallStatus = "failed";
        allResults.push({
          nodeId: "unknown",
          type: "unknown",
          status: "failed",
          error: settled.reason?.message ?? "Unknown error",
        });
      }
    }
  }

  // Complete the run
  await completeWorkflowRun(run.id, overallStatus);

  return {
    runId: run.id,
    status: overallStatus,
    nodeResults: allResults,
    hookFailures: [],
  };
}
