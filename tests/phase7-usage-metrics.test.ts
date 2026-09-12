import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { writeCallGraph } from "../src/call-graph"
import { projectPaths } from "../src/paths"
import { generateUsageMetrics } from "../src/usage-metrics"
import { tempProject } from "./phase3-helpers"

describe("Phase 7 usage metrics", () => {
  test("Given call graph evidence When usage metrics are generated Then incoming outgoing and normalized scores are stored", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "usage-fingerprint-123",
      calls: [
        {
          caller_entity_id: "sym_controller",
          callee_entity_id: "sym_service",
          callee_name: "createOrder",
          file_path: "src/controller.ts",
          line: 10,
          confidence: 0.99,
          confidence_label: "EXTRACTED",
        },
        {
          caller_entity_id: "sym_service",
          callee_entity_id: "sym_repo",
          callee_name: "saveOrder",
          file_path: "src/service.ts",
          line: 20,
          confidence: 0.88,
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

    const result = generateUsageMetrics(paths)

    const db = new Database(join(paths.stateDir, "retro", "call_graph.db"), { readonly: true })
    try {
      const rows = db
        .query<
          {
            readonly entity_id: string
            readonly incoming_ref_count: number
            readonly outgoing_ref_count: number
            readonly sql_ref_count: number
            readonly usage_score: number
          },
          []
        >(
          `select entity_id, incoming_ref_count, outgoing_ref_count, sql_ref_count, usage_score
           from usage_metrics
           order by entity_id`,
        )
        .all()

      expect(result.metrics).toEqual(rows)
      expect(rows).toEqual([
        {
          entity_id: "sym_controller",
          incoming_ref_count: 0,
          outgoing_ref_count: 2,
          sql_ref_count: 0,
          usage_score: 1,
        },
        {
          entity_id: "sym_repo",
          incoming_ref_count: 1,
          outgoing_ref_count: 0,
          sql_ref_count: 0,
          usage_score: 0.5,
        },
        {
          entity_id: "sym_service",
          incoming_ref_count: 1,
          outgoing_ref_count: 1,
          sql_ref_count: 0,
          usage_score: 1,
        },
      ])
    } finally {
      db.close()
    }
  })

  test("Given regenerated call graph When usage metrics are generated Then stale metric rows are cleared", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "usage-stale-1",
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
    generateUsageMetrics(paths)

    await writeCallGraph(paths, {
      sourceFingerprint: "usage-stale-2",
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

    const result = generateUsageMetrics(paths)

    expect(result.metrics.map((metric) => metric.entity_id)).toEqual(["sym_new_a", "sym_new_b"])
  })
})
