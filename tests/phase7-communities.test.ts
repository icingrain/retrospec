import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import ky from "ky"
import { writeCallGraph } from "../src/call-graph"
import { projectPaths } from "../src/paths"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

describe("Phase 7 community candidates", () => {
  afterEach(() => {
    stopDaemons()
  })

  test("Given call graph clusters When communities API is called Then EPIC candidates and derived rows are returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "community-fingerprint-123",
      calls: [
        {
          caller_entity_id: "sym_order_controller",
          callee_entity_id: "sym_order_service",
          callee_name: "createOrder",
          file_path: "src/order/controller.ts",
          line: 10,
          confidence: 0.99,
          confidence_label: "EXTRACTED",
        },
        {
          caller_entity_id: "sym_order_service",
          callee_entity_id: "sym_order_repo",
          callee_name: "saveOrder",
          file_path: "src/order/service.ts",
          line: 20,
          confidence: 0.42,
          confidence_label: "AMBIGUOUS",
        },
        {
          caller_entity_id: "sym_billing_controller",
          callee_entity_id: "sym_billing_service",
          callee_name: "charge",
          file_path: "src/billing/controller.ts",
          line: 30,
          confidence: 0.91,
          confidence_label: "EXTRACTED",
        },
      ],
      sequenceCandidates: [],
    })

    const response = await ky
      .get("graph/communities", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{
        readonly communities: readonly {
          readonly community_id: string
          readonly label: string
          readonly algorithm: string
          readonly resolution: number
          readonly entity_count: number
          readonly hub_entities: readonly string[]
          readonly ambiguous_edge_count: number
        }[]
      }>()

    const db = new Database(join(paths.stateDir, "retro", "call_graph.db"), { readonly: true })
    try {
      const rows = db
        .query<
          { readonly community_id: string; readonly entity_id: string; readonly label: string },
          []
        >(
          "select community_id, entity_id, label from graph_communities order by community_id, entity_id",
        )
        .all()

      expect(response.communities).toEqual([
        {
          community_id: "comm_1",
          label: "Community candidate 1",
          algorithm: "modularity-greedy-v1",
          resolution: 1,
          entity_count: 3,
          hub_entities: ["sym_order_service"],
          ambiguous_edge_count: 1,
        },
        {
          community_id: "comm_2",
          label: "Community candidate 2",
          algorithm: "modularity-greedy-v1",
          resolution: 1,
          entity_count: 2,
          hub_entities: ["sym_billing_controller", "sym_billing_service"],
          ambiguous_edge_count: 0,
        },
      ])
      expect(rows).toEqual([
        {
          community_id: "comm_1",
          entity_id: "sym_order_controller",
          label: "Community candidate 1",
        },
        { community_id: "comm_1", entity_id: "sym_order_repo", label: "Community candidate 1" },
        { community_id: "comm_1", entity_id: "sym_order_service", label: "Community candidate 1" },
        {
          community_id: "comm_2",
          entity_id: "sym_billing_controller",
          label: "Community candidate 2",
        },
        {
          community_id: "comm_2",
          entity_id: "sym_billing_service",
          label: "Community candidate 2",
        },
      ])
    } finally {
      db.close()
    }
  })

  test("Given regenerated call graph When communities are requested Then stale community rows are cleared", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "community-stale-1",
      calls: [
        {
          caller_entity_id: "sym_old_a",
          callee_entity_id: "sym_old_b",
          callee_name: "oldB",
          file_path: "src/old.ts",
          line: 1,
          confidence: 1,
          confidence_label: "EXTRACTED",
        },
      ],
      sequenceCandidates: [],
    })
    await ky.get("graph/communities", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      searchParams: { project_path: projectRoot },
    })

    await writeCallGraph(paths, {
      sourceFingerprint: "community-stale-2",
      calls: [
        {
          caller_entity_id: "sym_new_a",
          callee_entity_id: "sym_new_b",
          callee_name: "newB",
          file_path: "src/new.ts",
          line: 1,
          confidence: 1,
          confidence_label: "EXTRACTED",
        },
      ],
      sequenceCandidates: [],
    })

    const response = await ky
      .get("graph/communities", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{
        readonly communities: readonly { readonly hub_entities: readonly string[] }[]
      }>()

    expect(response.communities.map((community) => community.hub_entities)).toEqual([
      ["sym_new_a", "sym_new_b"],
    ])
  })

  test("Given weakly bridged dense modules When communities API is called Then modules are split by stronger internal coupling", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "community-modularity-1",
      calls: [
        edge("sym_order_controller", "sym_order_service", 10),
        edge("sym_order_service", "sym_order_repo", 11),
        edge("sym_order_repo", "sym_order_controller", 12),
        edge("sym_billing_controller", "sym_billing_service", 20),
        edge("sym_billing_service", "sym_billing_gateway", 21),
        edge("sym_billing_gateway", "sym_billing_controller", 22),
        edge("sym_order_service", "sym_billing_service", 30),
      ],
      sequenceCandidates: [],
    })

    const response = await ky
      .get("graph/communities", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot },
      })
      .json<{
        readonly communities: readonly {
          readonly algorithm: string
          readonly entity_count: number
          readonly hub_entities: readonly string[]
        }[]
      }>()

    expect(response.communities.map((community) => community.entity_count)).toEqual([3, 3])
    expect(
      response.communities.every((community) => community.algorithm === "modularity-greedy-v1"),
    ).toBe(true)
    expect(response.communities.map((community) => community.hub_entities)).toEqual([
      ["sym_billing_controller", "sym_billing_gateway", "sym_billing_service"],
      ["sym_order_controller", "sym_order_repo", "sym_order_service"],
    ])
  })

  test("Given missing project path When communities API is called Then a client error is returned", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.get("graph/communities", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      throwHttpErrors: false,
    })

    expect(response.status).toBe(400)
    expect(await response.json<{ readonly error: string }>()).toEqual({
      error: "invalid graph communities query",
    })
  })
})

function edge(caller: string, callee: string, line: number) {
  return {
    caller_entity_id: caller,
    callee_entity_id: callee,
    callee_name: callee,
    file_path: "src/graph.ts",
    line,
    confidence: 1,
    confidence_label: "EXTRACTED" as const,
  }
}
