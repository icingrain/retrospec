import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { installRetrospecOpenCodeConfig } from "../src/opencode-install"
import { mergeRetrospecMcpConfig, retrospecMcpServerName } from "../src/opencode-install-mcp"
import { tempProject } from "./phase3-helpers"

describe("Phase 13 opencode install MCP config", () => {
  test("Given no MCP config When install runs Then Retrospec MCP placeholder is added", async () => {
    const projectRoot = await tempProject()

    const result = await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(
      await readFile(join(projectRoot, ".opencode", "opencode.jsonc"), "utf8"),
    )
    expect(result.mcpServer).toBe(retrospecMcpServerName)
    expect(config.mcp.retrospec).toEqual({
      type: "remote",
      url: "http://127.0.0.1:0/mcp",
      enabled: false,
      headers: { Authorization: "Bearer " },
    })
  })

  test("Given user MCP entries When install runs Then user entries survive and Retrospec MCP is added", async () => {
    const projectRoot = await tempProject()
    const configPath = join(projectRoot, ".opencode", "opencode.jsonc")
    await mkdir(join(projectRoot, ".opencode"), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify({
        mcp: {
          context7: { type: "remote", url: "https://mcp.context7.com/mcp", enabled: true },
        },
      }),
    )

    await installRetrospecOpenCodeConfig(projectRoot)

    const config = JSON.parse(await readFile(configPath, "utf8"))
    expect(config.mcp.context7).toEqual({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      enabled: true,
    })
    expect(config.mcp.retrospec.enabled).toBe(false)
    expect(config.mcp.retrospec.url).toBe("http://127.0.0.1:0/mcp")
  })

  test("Given Retrospec MCP already exists When install runs Then existing Retrospec MCP is preserved", () => {
    const merged = mergeRetrospecMcpConfig({
      retrospec: {
        type: "remote",
        url: "http://127.0.0.1:49152/mcp",
        enabled: true,
        headers: { Authorization: "Bearer rtok_existing" },
      },
    })

    expect(merged["retrospec"]).toEqual({
      type: "remote",
      url: "http://127.0.0.1:49152/mcp",
      enabled: true,
      headers: { Authorization: "Bearer rtok_existing" },
    })
  })
})
