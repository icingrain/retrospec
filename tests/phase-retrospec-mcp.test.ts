import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { runRetroInventory } from "../src/retro/run"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeSampleProject,
} from "./phase3-helpers"

type JsonRpcErrorResponse = {
  readonly jsonrpc: "2.0"
  readonly id: number
  readonly error: { readonly code: number; readonly message: string }
}

describe("Phase 6 Retrospec MCP compatibility", () => {
  afterEach(() => {
    stopDaemons()
  })

  test("Given a legacy MCP client When tools are listed and called Then read-only Retrospec tools respond", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    const listed = await ky
      .post("mcp", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      })
      .json<{
        readonly result: {
          readonly resultType: string
          readonly tools: readonly { readonly name: string }[]
        }
      }>()

    expect(listed.result.resultType).toBe("complete")
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([
      "retrospec_status",
      "retrospec_explore",
    ])

    const called = await ky
      .post("mcp", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "retrospec_status", arguments: { project_path: projectRoot } },
        },
      })
      .json<{
        readonly result: {
          readonly resultType: string
          readonly structuredContent: { readonly retro: readonly { readonly category: string }[] }
        }
      }>()

    expect(called.result.resultType).toBe("complete")
    expect(called.result.structuredContent.retro.map((status) => status.category)).toContain(
      "structure",
    )
  })

  test("Given a 2026 stateless MCP client When metadata headers are supplied Then the same read-only tools respond without a session", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky
      .post("mcp", {
        prefixUrl: endpoint.baseUrl,
        headers: {
          Authorization: `Bearer ${endpoint.token}`,
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "retrospec_explore",
        },
        json: {
          jsonrpc: "2.0",
          id: "stateless-1",
          method: "tools/call",
          params: {
            name: "retrospec_explore",
            arguments: { project_path: projectRoot, anchor: "OrderService", depth: 1 },
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": { name: "stateless-test", version: "1.0.0" },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        },
      })
      .json<{
        readonly result: {
          readonly resultType: string
          readonly structuredContent: { readonly anchor: { readonly requested: string } }
        }
      }>()

    expect(response.result.resultType).toBe("complete")
    expect(response.result.structuredContent.anchor.requested).toBe("OrderService")
  })

  test("Given opt-in tools are disabled When a mutating or extended MCP tool is called Then it is rejected", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.post("mcp", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "retrospec_sql_access", arguments: {} },
      },
      throwHttpErrors: false,
    })

    expect(response.status).toBe(200)
    const body = await response.json<JsonRpcErrorResponse>()

    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32601, message: "MCP tool is not enabled: retrospec_sql_access" },
    })
  })

  test("Given a stateless MCP request When Mcp-Name disagrees with params Then the request is rejected", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.post("mcp", {
      prefixUrl: endpoint.baseUrl,
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "retrospec_status",
      },
      json: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "retrospec_explore", arguments: {} },
      },
      throwHttpErrors: false,
    })
    const body = await response.json<JsonRpcErrorResponse>()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 4,
      error: { code: -32600, message: "Mcp-Name header does not match request" },
    })
  })
})
