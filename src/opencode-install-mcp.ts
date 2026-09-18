import { z } from "zod"

export const retrospecMcpServerName = "retrospec"

const mcpConfigSchema = z.record(z.unknown()).catch({})

export function mergeRetrospecMcpConfig(value: unknown): Record<string, unknown> {
  const existing = mcpConfigSchema.parse(value)
  if (Object.hasOwn(existing, retrospecMcpServerName)) {
    return existing
  }
  return { ...existing, [retrospecMcpServerName]: createRetrospecMcpPlaceholder() }
}

function createRetrospecMcpPlaceholder(): Record<string, unknown> {
  return {
    type: "remote",
    url: "http://127.0.0.1:0/mcp",
    enabled: false,
    headers: { Authorization: "Bearer " },
  }
}
