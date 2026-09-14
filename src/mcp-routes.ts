import type { Hono } from "hono"
import { z } from "zod"
import { exploreOntology } from "./ontology-explore"
import { projectPaths } from "./paths"
import { ensureProjectRegistry, readRetroStatuses } from "./registry"
import { readSpecStatuses } from "./spec/status"
import { version } from "./version"

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

type McpParsedRequest = z.infer<typeof mcpRequestSchema> & { readonly id: McpRequestId }

type McpCallToolResult = {
  readonly content: readonly { readonly type: "text"; readonly text: string }[]
  readonly structuredContent: unknown
}

const mcpRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
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

const initializeParamsSchema = z.object({ protocolVersion: z.string().min(1) }).passthrough()

export function registerMcpRoutes(app: Hono): void {
  app.post("/mcp", async (c) => {
    const parsedJson = await parseJsonRequest(c.req.raw)
    if (!parsedJson.ok) {
      return c.json(jsonRpcError(null, -32700, "Parse error"))
    }

    const parsed = mcpRequestSchema.safeParse(parsedJson.value)
    if (!parsed.success) {
      return c.json(jsonRpcError(null, -32600, "Invalid MCP JSON-RPC request"))
    }

    const requestId = parsed.data.id ?? null

    const headerMethod = c.req.header("Mcp-Method")
    if (headerMethod !== undefined && headerMethod !== parsed.data.method) {
      return c.json(jsonRpcError(requestId, -32600, "Mcp-Method header does not match request"))
    }
    const headerName = c.req.header("Mcp-Name")
    if (headerName !== undefined && !mcpNameMatches(parsed.data.params, headerName)) {
      return c.json(jsonRpcError(requestId, -32600, "Mcp-Name header does not match request"))
    }

    const response = await handleMcpRequest({ ...parsed.data, id: requestId })
    return response === undefined ? c.body(null, 204) : c.json(response)
  })
}

async function parseJsonRequest(
  request: Request,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
  try {
    return { ok: true, value: await request.json() }
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false }
    }
    throw error
  }
}

async function handleMcpRequest(
  request: McpParsedRequest,
): Promise<McpJsonRpcResponse | undefined> {
  if (request.method === "notifications/initialized") {
    return undefined
  }

  if (request.method === "ping") {
    return jsonRpcResult(request.id, {})
  }

  if (request.method === "initialize") {
    return jsonRpcResult(request.id, {
      protocolVersion: requestedProtocolVersion(request.params),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "retrospec", version },
    })
  }

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
    const parsedArguments = statusArgumentsSchema.safeParse(parsedParams.data.arguments)
    if (!parsedArguments.success) {
      return jsonRpcError(request.id, -32602, "Invalid retrospec_status arguments")
    }
    return jsonRpcResult(request.id, await callRetrospecStatus(parsedArguments.data))
  }
  if (toolName === "retrospec_explore") {
    const parsedArguments = exploreArgumentsSchema.safeParse(parsedParams.data.arguments)
    if (!parsedArguments.success) {
      return jsonRpcError(request.id, -32602, "Invalid retrospec_explore arguments")
    }
    return jsonRpcResult(request.id, await callRetrospecExplore(parsedArguments.data))
  }

  return jsonRpcError(request.id, -32601, `MCP tool is not implemented: ${toolName}`)
}

function requestedProtocolVersion(params: unknown): string {
  const parsed = initializeParamsSchema.safeParse(params)
  return parsed.success ? parsed.data.protocolVersion : "2024-11-05"
}

async function callRetrospecStatus(
  request: z.infer<typeof statusArgumentsSchema>,
): Promise<McpCallToolResult> {
  const paths = projectPaths(request.project_path)
  await ensureProjectRegistry(paths)
  const structuredContent = {
    project_path: paths.projectRoot,
    retro: readRetroStatuses(paths),
    spec: readSpecStatuses(paths),
  }
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  }
}

async function callRetrospecExplore(
  request: z.infer<typeof exploreArgumentsSchema>,
): Promise<McpCallToolResult> {
  const paths = projectPaths(request.project_path)
  await ensureProjectRegistry(paths)
  const structuredContent = exploreOntology(
    paths,
    request.anchor,
    request.depth,
    new Set(["structure", "semantics", "evidence"]),
  )
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
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
