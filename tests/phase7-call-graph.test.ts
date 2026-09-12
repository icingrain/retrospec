import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { writeCallGraph } from "../src/call-graph"
import { projectPaths } from "../src/paths"
import { tempProject } from "./phase3-helpers"

describe("Phase 7 call graph confidence schema", () => {
  test("Given call graph evidence When writer runs Then calls preserve confidence labels and ambiguous review evidence", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    await writeCallGraph(paths, {
      sourceFingerprint: "call-graph-fingerprint-123",
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
        {
          caller_entity_id: "sym_controller",
          callee_entity_id: null,
          callee_name: "handler",
          file_path: "src/controller.ts",
          line: 21,
          confidence: 0.35,
          confidence_label: "AMBIGUOUS",
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

    const db = new Database(join(paths.stateDir, "retro", "call_graph.db"), { readonly: true })
    try {
      const labels = db.query("select confidence_label from calls order by line").values().flat()
      const ambiguous = db
        .query("select callee_entity_id, confidence, confidence_label from calls where line = 21")
        .get() as {
        readonly callee_entity_id: string | null
        readonly confidence: number
        readonly confidence_label: string
      }
      const sequence = db
        .query("select participant_entity_ids, call_path, reason from sequence_candidates")
        .get() as {
        readonly participant_entity_ids: string
        readonly call_path: string
        readonly reason: string | null
      }

      expect(labels).toEqual(["EXTRACTED", "AMBIGUOUS"])
      expect(ambiguous.callee_entity_id).toBeNull()
      expect(ambiguous.confidence).toBe(0.35)
      expect(ambiguous.confidence_label).toBe("AMBIGUOUS")
      expect(JSON.parse(sequence.participant_entity_ids)).toEqual(["sym_controller", "sym_service"])
      expect(JSON.parse(sequence.call_path)).toEqual(["sym_controller", "sym_service"])
      expect(sequence.reason).toBe("controller-to-service happy path has extracted evidence")
    } finally {
      db.close()
    }
  })
})
