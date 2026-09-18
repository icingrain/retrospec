import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import { retrospecMcpServerName } from "./opencode-install-mcp"
import type { DaemonEndpoint } from "./types"

const opencodeMcpSyncConfigSchema = z
  .object({ mcp: z.record(z.unknown()).optional() })
  .passthrough()

type OpenCodeMcpSyncConfig = z.infer<typeof opencodeMcpSyncConfigSchema>

export async function syncRetrospecMcpEndpoint(
  projectRoot: string,
  endpoint: DaemonEndpoint,
): Promise<string> {
  const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
  const config = await readOpenCodeMcpSyncConfig(configPath)
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(
    configPath,
    `${JSON.stringify({ ...config, mcp: syncMcpConfig(config.mcp, endpoint) }, null, 2)}\n`,
  )
  return configPath
}

export function syncMcpConfig(value: unknown, endpoint: DaemonEndpoint): Record<string, unknown> {
  const existing = z.record(z.unknown()).catch({}).parse(value)
  return {
    ...existing,
    [retrospecMcpServerName]: syncRetrospecMcpServer(existing[retrospecMcpServerName], endpoint),
  }
}

function syncRetrospecMcpServer(value: unknown, endpoint: DaemonEndpoint): Record<string, unknown> {
  const existing = z.record(z.unknown()).catch({}).parse(value)
  const headers = z.record(z.unknown()).catch({}).parse(existing["headers"])
  return {
    ...existing,
    type: "remote",
    url: `${endpoint.baseUrl}/mcp`,
    enabled: true,
    headers: { ...headers, Authorization: `Bearer ${endpoint.token}` },
  }
}

async function readOpenCodeMcpSyncConfig(configPath: string): Promise<OpenCodeMcpSyncConfig> {
  const file = Bun.file(configPath)
  if (!(await file.exists())) {
    return {}
  }
  const raw = await readFile(configPath, "utf8")
  return opencodeMcpSyncConfigSchema.parse(JSON.parse(stripJsonComments(raw)))
}

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
}
