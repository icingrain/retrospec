import type { Hono } from "hono"
import { z } from "zod"
import { exploreOntology } from "./ontology-explore"
import { projectPaths } from "./paths"
import { ensureProjectRegistry, readRetroStatuses } from "./registry"
import { readSpecStatuses } from "./spec/status"

const DEFAULT_MCP_TOOLS = ["retrospec_status", "retrospec_explore"] as const
const OPTIONAL_MCP_TOOLS = [
  "retrospec_impact",
  "retrospec_epics",
  "retrospec_glossary_search",
  "retrospec_sql_access",
  "retrospec_export",
] as const

type McpToolName = (typeof DEFAULT_MCP_TOOLS)[number] | (typeof OPTIONAL_MCP_TOOLS)[number]

type McpRequestId = string | number | null

type McpJsonRpcResponse = {
  readonly jsonrpc: "2.0"
  readonly id: McpRequestId
  readonly result?: unknown
  readonly error?: { readonly code: number; readonly message: string }
}

const mcpRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).default(null),
  method: z.string().min(1),
  params: z.unknown().optional(),
})

const toolCallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  _meta: z.record(z.unknown()).optional(),
})

const statusArgumentsSchema = z.object({ project_path: z.string().min(1) })

const exploreArgumentsSchema = z.object({
  project_path: z.string().min(1),
  anchor: z.string().min(1),
  depth: z.number().int().min(1).max(4).default(1),
})

export function registerMcpRoutes(app: Hono): void {
  app.post("/mcp", async (c) => {
    const parsed = mcpRequestSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json(jsonRpcError(null, -32600, "Invalid MCP JSON-RPC request"))
    }

    const headerMethod = c.req.header("Mcp-Method")
    if (headerMethod !== undefined && headerMethod !== parsed.data.method) {
      return c.json(
        jsonRpcError(parsed.data.id, -32600, "Mcp-Method header does not match request"),
      )
    }
    const headerName = c.req.header("Mcp-Name")
    if (headerName !== undefined && !mcpNameMatches(parsed.data.params, headerName)) {
      return c.json(jsonRpcError(parsed.data.id, -32600, "Mcp-Name header does not match request"))
    }

    return c.json(await handleMcpRequest(parsed.data))
  })
}

async function handleMcpRequest(
  request: z.infer<typeof mcpRequestSchema>,
): Promise<McpJsonRpcResponse> {
  if (request.method === "tools/list") {
    return jsonRpcResult(request.id, {
      resultType: "complete",
      tools: enabledToolNames().map((name) => toolDescription(name)),
      ttlMs: 300_000,
      cacheScope: "public",
    })
  }

  if (request.method !== "tools/call") {
    return jsonRpcError(request.id, -32601, `MCP method is not supported: ${request.method}`)
  }

  const parsedParams = toolCallParamsSchema.safeParse(request.params)
  if (!parsedParams.success) {
    return jsonRpcError(request.id, -32602, "Invalid MCP tool call params")
  }

  const toolName = parsedParams.data.name
  if (!isMcpToolName(toolName) || !enabledToolNames().includes(toolName)) {
    return jsonRpcError(request.id, -32601, `MCP tool is not enabled: ${toolName}`)
  }

  if (toolName === "retrospec_status") {
    return jsonRpcResult(request.id, await callRetrospecStatus(parsedParams.data.arguments))
  }
  if (toolName === "retrospec_explore") {
    return jsonRpcResult(request.id, await callRetrospecExplore(parsedParams.data.arguments))
  }

  return jsonRpcError(request.id, -32601, `MCP tool is not implemented: ${toolName}`)
}

async function callRetrospecStatus(argumentsRecord: Record<string, unknown>): Promise<unknown> {
  const request = statusArgumentsSchema.parse(argumentsRecord)
  const paths = projectPaths(request.project_path)
  await ensureProjectRegistry(paths)
  return {
    resultType: "complete",
    structuredContent: {
      project_path: paths.projectRoot,
      retro: readRetroStatuses(paths),
      spec: readSpecStatuses(paths),
    },
  }
}

async function callRetrospecExplore(argumentsRecord: Record<string, unknown>): Promise<unknown> {
  const request = exploreArgumentsSchema.parse(argumentsRecord)
  const paths = projectPaths(request.project_path)
  await ensureProjectRegistry(paths)
  return {
    resultType: "complete",
    structuredContent: exploreOntology(
      paths,
      request.anchor,
      request.depth,
      new Set(["structure", "semantics", "evidence"]),
    ),
  }
}

function enabledToolNames(): readonly McpToolName[] {
  const configured = process.env["RETROSPEC_MCP_TOOLS"]
  if (configured === undefined || configured.trim().length === 0) {
    return DEFAULT_MCP_TOOLS
  }
  const requested = configured.split(",").map((name) => name.trim())
  const enabledOptional = OPTIONAL_MCP_TOOLS.filter((name) => requested.includes(name))
  return [...DEFAULT_MCP_TOOLS, ...enabledOptional]
}

function isMcpToolName(value: string): value is McpToolName {
  return [...DEFAULT_MCP_TOOLS, ...OPTIONAL_MCP_TOOLS].some((name) => name === value)
}

function mcpNameMatches(params: unknown, headerName: string): boolean {
  const parsedParams = toolCallParamsSchema.safeParse(params)
  return !parsedParams.success || parsedParams.data.name === headerName
}

function toolDescription(name: McpToolName): unknown {
  return {
    name,
    title: name,
    description: `Read-only Retrospec tool: ${name}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
  }
}

function jsonRpcResult(id: McpRequestId, result: unknown): McpJsonRpcResponse {
  return { jsonrpc: "2.0", id, result }
}

function jsonRpcError(id: McpRequestId, code: number, message: string): McpJsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } }
}
