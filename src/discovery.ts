import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { spawn } from "bun"
import ky from "ky"
import { runtimePaths } from "./paths"
import { healthResponseSchema } from "./schemas"
import type { DaemonEndpoint, HealthResponse, RuntimePaths } from "./types"
import { version } from "./version"

type DaemonProcess = {
  unref(): void
}

type DaemonSpawnOptions = NonNullable<Parameters<typeof spawn>[1]>

type DaemonSpawn = (command: readonly string[], options: DaemonSpawnOptions) => DaemonProcess

type EnsureDaemonOptions = {
  readonly spawnProcess?: DaemonSpawn
  readonly readEndpointFn?: typeof readEndpoint
  readonly healthFn?: typeof health
  readonly sleep?: (milliseconds: number) => Promise<void>
}

export async function readEndpoint(paths = runtimePaths()): Promise<DaemonEndpoint | null> {
  try {
    const [portText, tokenText] = await Promise.all([
      readFile(paths.portFile, "utf8"),
      readFile(paths.tokenFile, "utf8"),
    ])
    const port = Number.parseInt(portText.trim(), 10)

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      return null
    }

    const token = tokenText.trim()
    if (token.length === 0) {
      return null
    }

    return { port, token, baseUrl: `http://127.0.0.1:${port}` }
  } catch (error) {
    if (error instanceof Error) {
      return null
    }
    throw error
  }
}

export async function health(endpoint: DaemonEndpoint): Promise<HealthResponse | null> {
  try {
    const body = await ky.get("health", { prefixUrl: endpoint.baseUrl, timeout: 500 }).json()
    return healthResponseSchema.parse(body)
  } catch (error) {
    if (error instanceof Error) {
      return null
    }
    throw error
  }
}

export async function ensureDaemon(
  paths: RuntimePaths = runtimePaths(),
  options: EnsureDaemonOptions = {},
): Promise<DaemonEndpoint> {
  const readEndpointForPaths = options.readEndpointFn ?? readEndpoint
  const healthEndpoint = options.healthFn ?? health
  const existing = await readEndpointForPaths(paths)
  const existingHealth = existing === null ? null : await healthEndpoint(existing)
  if (existing !== null && existingHealth !== null && existingHealth.version === version) {
    return existing
  }

  const spawnProcess = options.spawnProcess ?? spawnDaemon
  const processHandle = spawnProcess([process.execPath, "run", daemonCliPath(), "daemon"], {
    cwd: process.cwd(),
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  })
  processHandle.unref()

  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    const endpoint = await readEndpointForPaths(paths)
    const endpointHealth = endpoint === null ? null : await healthEndpoint(endpoint)
    if (endpoint !== null && endpointHealth !== null && endpointHealth.version === version) {
      return endpoint
    }
    await (options.sleep ?? Bun.sleep)(50)
  }

  throw new Error("retrospec daemon did not become healthy")
}

function daemonCliPath(): string {
  return fileURLToPath(new URL("./cli.ts", import.meta.url))
}

function spawnDaemon(command: readonly string[], options: DaemonSpawnOptions): DaemonProcess {
  return spawn([...command], options)
}
