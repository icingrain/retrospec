import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type DaemonServer, startDaemon } from "../src/daemon"
import { syncMcpConfig, syncRetrospecMcpEndpoint } from "../src/opencode-mcp-sync"
import { routerSummary } from "../src/router"
import type { DaemonEndpoint } from "../src/types"
import { tempProject, tempRuntime } from "./phase3-helpers"

const daemons: DaemonServer[] = []

afterEach(() => {
  for (const daemon of daemons.splice(0)) {
    daemon.stop()
  }
})

describe("Phase 13 opencode MCP endpoint sync", () => {
  test("Given existing MCP config When endpoint syncs Then Retrospec MCP gets live URL and token", () => {
    const endpoint = daemonEndpoint()

    const synced = syncMcpConfig(
      {
        context7: { type: "remote", url: "https://mcp.context7.com/mcp" },
        retrospec: {
          type: "remote",
          url: "http://127.0.0.1:0/mcp",
          enabled: false,
          headers: { "X-Retrospec": "keep" },
        },
      },
      endpoint,
    )

    expect(synced["context7"]).toEqual({ type: "remote", url: "https://mcp.context7.com/mcp" })
    expect(synced["retrospec"]).toEqual({
      type: "remote",
      url: "http://127.0.0.1:49152/mcp",
      enabled: true,
      headers: { "X-Retrospec": "keep", Authorization: "Bearer rtok_live" },
    })
  })

  test("Given an opencode config file When endpoint syncs Then config file contains live Retrospec MCP", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(configPath, JSON.stringify({ mcp: { context7: { enabled: true } } }))

    const syncedPath = await syncRetrospecMcpEndpoint(projectRoot, daemonEndpoint())

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(syncedPath).toBe(configPath)
    expect(config.mcp.context7).toEqual({ enabled: true })
    expect(config.mcp.retrospec.url).toBe("http://127.0.0.1:49152/mcp")
    expect(config.mcp.retrospec.enabled).toBe(true)
    expect(config.mcp.retrospec.headers.Authorization).toBe("Bearer rtok_live")
  })

  test("Given status runs for a project When router summarizes Then opencode MCP points at the healthy daemon", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      join(projectRoot, ".opencode", "opencode.jsonc"),
      JSON.stringify({ mcp: { retrospec: { enabled: false } } }),
    )
    const daemon = await startDaemon(runtime)
    daemons.push(daemon)

    await routerSummary(projectRoot, runtime)

    const config = JSON.parse(
      await readFile(join(projectRoot, ".opencode", "opencode.jsonc"), "utf8"),
    )
    expect(config.mcp.retrospec).toMatchObject({
      type: "remote",
      url: `http://127.0.0.1:${daemon.port}/mcp`,
      enabled: true,
      headers: { Authorization: `Bearer ${daemon.token}` },
    })
  })
})

function daemonEndpoint(): DaemonEndpoint {
  return { port: 49152, token: "rtok_live", baseUrl: "http://127.0.0.1:49152" }
}
