import { afterEach, describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import ky from "ky"
import { writeCallGraph } from "../src/call-graph"
import { projectPaths } from "../src/paths"
import { daemonEndpoint, stopDaemons, tempProject, tempRuntime } from "./phase3-helpers"

describe("Phase 5 graph exports", () => {
  afterEach(() => {
    stopDaemons()
  })

  test("Given call graph data When GraphML export is requested Then a GraphML file is written and listed", async () => {
    const { endpoint, projectRoot, paths } = await seedGraphProject()

    const response = await ky
      .get("graph/export", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot, format: "graphml" },
      })
      .json<{ readonly export_file: { readonly file_name: string; readonly format: string } }>()

    const graphml = await readFile(join(paths.exportsDir, "call_graph.graphml"), "utf8")

    expect(response.export_file.file_name).toBe("call_graph.graphml")
    expect(response.export_file.format).toBe("graphml")
    expect(graphml).toContain("<graphml")
    expect(graphml).toContain('<node id="sym_controller"/>')
    expect(graphml).toContain('<edge source="sym_controller" target="sym_service">')
  })

  test("Given call graph data When Cypher export is requested Then importable Cypher is written", async () => {
    const { endpoint, projectRoot, paths } = await seedGraphProject()

    await ky.get("graph/export", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      searchParams: { project_path: projectRoot, format: "cypher" },
    })

    const cypher = await readFile(join(paths.exportsDir, "call_graph.cypher"), "utf8")

    expect(cypher).toContain("MERGE (caller:Entity {id: 'sym_controller'})")
    expect(cypher).toContain(
      "MERGE (caller)-[:CALLS {confidence: 0.99, label: 'EXTRACTED'}]->(callee);",
    )
  })

  test("Given sequence candidates When Mermaid export is requested Then sequence diagram source is written", async () => {
    const { endpoint, projectRoot, paths } = await seedGraphProject()

    await ky.get("graph/export", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      searchParams: { project_path: projectRoot, format: "mermaid" },
    })

    const mermaid = await readFile(join(paths.exportsDir, "call_graph.mmd"), "utf8")

    expect(mermaid).toContain("sequenceDiagram")
    expect(mermaid).toContain("participant sym_controller")
    expect(mermaid).toContain("sym_controller->>sym_service: call")
  })

  test("Given missing format When graph export is requested Then a client error is returned", async () => {
    const runtime = await tempRuntime()
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky.get("graph/export", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      throwHttpErrors: false,
    })

    expect(response.status).toBe(400)
    expect(await response.json<{ readonly error: string }>()).toEqual({
      error: "invalid graph export query",
    })
  })
})

async function seedGraphProject() {
  const runtime = await tempRuntime()
  const projectRoot = await tempProject()
  const endpoint = await daemonEndpoint(runtime)
  const paths = projectPaths(projectRoot)

  await writeCallGraph(paths, {
    sourceFingerprint: "graph-export-fingerprint-1",
    calls: [
      {
        caller_entity_id: "sym_controller",
        callee_entity_id: "sym_service",
        callee_name: "createOrder",
        file_path: "src/controller.ts",
        line: 14,
        confidence: 0.99,
        confidence_label: "EXTRACTED",
      },
    ],
    sequenceCandidates: [
      {
        sequence_id: "seq_checkout",
        root_entity_id: "sym_controller",
        participant_entity_ids: ["sym_controller", "sym_service"],
        call_path: ["sym_controller", "sym_service"],
        confidence: 0.82,
        reason: "controller-to-service happy path has extracted evidence",
      },
    ],
  })

  return { endpoint, projectRoot, paths }
}
