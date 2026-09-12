import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { writeCallGraph } from "../src/call-graph"
import { projectPaths } from "../src/paths"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

describe("Phase 7 graph impact API", () => {
  afterEach(() => {
    stopDaemons()
  })

  test("Given call graph evidence When graph impact API is called Then impacted callers callees and confidence summary are returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "impact-fingerprint-123",
      calls: [
        {
          caller_entity_id: "sym_controller",
          callee_entity_id: "sym_service",
          callee_name: "createOrder",
          file_path: "src/controller.ts",
          line: 10,
          confidence: 0.98,
          confidence_label: "EXTRACTED",
        },
        {
          caller_entity_id: "sym_route",
          callee_entity_id: "sym_controller",
          callee_name: "handleOrder",
          file_path: "src/routes.ts",
          line: 20,
          confidence: 0.72,
          confidence_label: "INFERRED",
        },
        {
          caller_entity_id: "sym_controller",
          callee_entity_id: null,
          callee_name: "dynamicHandler",
          file_path: "src/controller.ts",
          line: 30,
          confidence: 0.31,
          confidence_label: "AMBIGUOUS",
        },
      ],
      sequenceCandidates: [],
    })

    const response = await ky
      .get("graph/impact", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot, entity_id: "sym_controller", depth: "1" },
      })
      .json<{
        readonly root_entity_id: string
        readonly depth: number
        readonly impacted_entities: readonly {
          readonly entity_id: string
          readonly relationship: string
          readonly distance: number
          readonly confidence: number
          readonly confidence_label: string
          readonly file_path: string
        }[]
        readonly impacted_files: readonly string[]
        readonly usage: {
          readonly incoming_ref_count: number
          readonly outgoing_ref_count: number
          readonly usage_score: number
        }
        readonly confidence_summary: {
          readonly EXTRACTED: number
          readonly INFERRED: number
          readonly AMBIGUOUS: number
        }
      }>()

    expect(response.root_entity_id).toBe("sym_controller")
    expect(response.depth).toBe(1)
    expect(response.impacted_entities).toEqual([
      {
        entity_id: "sym_service",
        relationship: "callee",
        distance: 1,
        confidence: 0.98,
        confidence_label: "EXTRACTED",
        file_path: "src/controller.ts",
      },
      {
        entity_id: "sym_route",
        relationship: "caller",
        distance: 1,
        confidence: 0.72,
        confidence_label: "INFERRED",
        file_path: "src/routes.ts",
      },
    ])
    expect(response.impacted_files).toEqual(["src/controller.ts", "src/routes.ts"])
    expect(response.usage).toEqual({ incoming_ref_count: 1, outgoing_ref_count: 2, usage_score: 1 })
    expect(response.confidence_summary).toEqual({ EXTRACTED: 1, INFERRED: 1, AMBIGUOUS: 1 })
  })

  test("Given depth two traversal When an edge is revisited Then confidence summary counts unique call evidence", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "impact-depth-fingerprint-123",
      calls: [
        {
          caller_entity_id: "sym_a",
          callee_entity_id: "sym_b",
          callee_name: "b",
          file_path: "src/a.ts",
          line: 1,
          confidence: 1,
          confidence_label: "EXTRACTED",
        },
        {
          caller_entity_id: "sym_b",
          callee_entity_id: "sym_a",
          callee_name: "a",
          file_path: "src/b.ts",
          line: 2,
          confidence: 0.8,
          confidence_label: "INFERRED",
        },
      ],
      sequenceCandidates: [],
    })

    const response = await ky
      .get("graph/impact", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot, entity_id: "sym_a", depth: "2" },
      })
      .json<{
        readonly impacted_entities: readonly {
          readonly entity_id: string
          readonly relationship: string
        }[]
        readonly confidence_summary: {
          readonly EXTRACTED: number
          readonly INFERRED: number
          readonly AMBIGUOUS: number
        }
      }>()

    expect(
      response.impacted_entities.map((entity) => ({
        entity_id: entity.entity_id,
        relationship: entity.relationship,
      })),
    ).toEqual([
      { entity_id: "sym_b", relationship: "callee" },
      { entity_id: "sym_b", relationship: "caller" },
    ])
    expect(response.confidence_summary).toEqual({ EXTRACTED: 1, INFERRED: 1, AMBIGUOUS: 0 })
  })

  test("Given invalid depth When graph impact API is called Then a client error is returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.get("graph/impact", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      searchParams: { project_path: projectRoot, entity_id: "sym_a", depth: "99" },
      throwHttpErrors: false,
    })

    expect(response.status).toBe(400)
    expect(await response.json<{ readonly error: string }>()).toEqual({
      error: "invalid graph impact query",
    })
  })
})
