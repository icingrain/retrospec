import { afterEach, describe, expect, test } from "bun:test"
import ky from "ky"
import { writeCallGraph } from "../src/call-graph"
import { importStagedGlossaryCsv } from "../src/glossary"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { runSpecAnalysis } from "../src/spec/run"
import { stageGlossaryUpload } from "../src/uploads"
import {
  daemonEndpoint,
  stopDaemons,
  tempProject,
  tempRuntime,
  writeSampleProject,
} from "./phase3-helpers"

describe("Phase 6 ontology explore and glossary search APIs", () => {
  afterEach(() => {
    stopDaemons()
  })

  test("Given federated Retrospec state When ontology explore is requested Then structure semantics confidence and staleness are returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    await importStagedGlossaryCsv(paths, {
      uploadId: (
        await stageGlossaryUpload(
          paths,
          new File(["term,meaning\nOrderService,Handles order totals\n"], "glossary.csv"),
        )
      ).upload_id,
    })
    await writeCallGraph(paths, {
      sourceFingerprint: "ontology-call-graph-fingerprint",
      calls: [
        {
          caller_entity_id: "sym_OrderService_total",
          callee_entity_id: "sym_OrderService_helper",
          callee_name: "helper",
          file_path: "src/main/java/demo/OrderService.java",
          line: 3,
          confidence: 0.88,
          confidence_label: "INFERRED",
        },
      ],
      sequenceCandidates: [],
    })
    await runSpecAnalysis(paths)
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky
      .get("ontology/explore", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: {
          project_path: projectRoot,
          anchor: "OrderService",
          depth: "1",
          include: "structure,semantics,evidence",
        },
      })
      .json<{
        readonly anchor: { readonly requested: string; readonly resolved_entity_id: string | null }
        readonly structure: {
          readonly entities: readonly {
            readonly entity_id: string
            readonly symbol_name: string | null
          }[]
        }
        readonly semantics: {
          readonly glossary: readonly { readonly term: string }[]
          readonly findings: readonly { readonly summary: string }[]
        }
        readonly confidence: { readonly evidence_label: string; readonly confidence_label: string }
        readonly status: { readonly stale_entities: readonly string[] }
      }>()

    expect(response.anchor).toMatchObject({ requested: "OrderService" })
    expect(response.anchor.resolved_entity_id).toBeString()
    expect(response.structure.entities).toContainEqual(
      expect.objectContaining({ symbol_name: "OrderService" }),
    )
    expect(response.semantics.glossary).toContainEqual(
      expect.objectContaining({ term: "OrderService" }),
    )
    expect(response.semantics.findings[0]?.summary).toContain("OrderService")
    expect(response.confidence).toEqual({
      evidence_label: "EXTRACTED",
      confidence_label: "EXTRACTED",
    })
    expect(response.status.stale_entities).toEqual([])
  })

  test("Given glossary terms When glossary search is requested Then matching entities and source confidence are returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    await writeSampleProject(projectRoot)
    await runRetroInventory(projectRoot)
    const paths = projectPaths(projectRoot)
    const staged = await stageGlossaryUpload(
      paths,
      new File(["term,meaning\nOrderService,Handles order totals\n"], "glossary.csv"),
    )
    await importStagedGlossaryCsv(paths, { uploadId: staged.upload_id })
    const endpoint = await daemonEndpoint(runtime)

    const response = await ky
      .get("glossary/search", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        searchParams: { project_path: projectRoot, term: "order totals" },
      })
      .json<{
        readonly matches: readonly {
          readonly term: string
          readonly meaning: string
          readonly entity_id: string | null
          readonly symbol_name: string | null
          readonly confidence: number
          readonly source: string
        }[]
      }>()

    expect(response.matches).toContainEqual(
      expect.objectContaining({
        term: "OrderService",
        meaning: "Handles order totals",
        symbol_name: "OrderService",
        confidence: 1,
        source: "glossary_terms",
      }),
    )
  })
})
