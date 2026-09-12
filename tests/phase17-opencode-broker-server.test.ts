import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { loadSpecProviderConfig } from "../src/config"
import { createOpencodeBrokerApp } from "../src/opencode-broker"
import { selectSpecAnalysisDriver } from "../src/spec-analysis"
import type { SpecBatchInput } from "../src/spec/types"

const brokerAnalyzeResponseSchema = z.object({
  broker_run_id: z.string().optional(),
  findings: z.array(
    z.object({
      entityId: z.string(),
      severity: z.string(),
      riskType: z.string(),
      summary: z.string(),
    }),
  ),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
    costUsd: z.number(),
  }),
})

const specInput: SpecBatchInput = {
  handoffs: [],
  preflight: {
    status: "ready",
    reviewNeeded: false,
    coverageLanguages: ["java"],
    coverageModes: ["symbols"],
    parserModes: [{ value: "tree_sitter", count: 1 }],
    supportLevels: [{ value: "high-confidence", count: 1 }],
    evidenceLabels: [{ value: "EXTRACTED", count: 1 }],
    missingCapabilities: [],
    notes: [],
  },
  entities: [
    {
      entityId: "entity_broker_1",
      entityType: "method",
      filePath: "src/main/java/demo/OrderService.java",
      symbolName: "total",
      signature: "public int total(int amount)",
      sourceCategory: "symbols",
      contentHash: "hash-1",
      evidence: {
        parser_backend: "tree_sitter",
        parser_mode: "ast",
        support_level: "high-confidence",
        evidence_label: "EXTRACTED",
        missing_capability: null,
      },
    },
  ],
  memoryNotes: [],
  glossaryMatches: [],
}

describe("Phase 17 opencode broker server", () => {
  test("Given broker server When health is requested Then supported risk protocol is returned", async () => {
    const app = createOpencodeBrokerApp({ version: "0.1.6" })

    const response = await app.request("/health")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      version: "0.1.6",
      supports: {
        protocol_versions: [1],
        analysis_types: ["risk"],
        prompt_versions: ["risk-v1"],
      },
    })
  })

  test("Given valid broker request When spec analyze is posted Then client-compatible findings are returned", async () => {
    const app = createOpencodeBrokerApp({ brokerToken: "shared-secret", version: "0.1.6" })

    const response = await app.request("/spec/analyze", {
      method: "POST",
      headers: { authorization: "Bearer shared-secret" },
      body: JSON.stringify({
        protocol_version: 1,
        analysis_type: "risk",
        prompt_version: "risk-v1",
        model: "openai/gpt-5.5",
        input: specInput,
      }),
    })
    const body = brokerAnalyzeResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      findings: [
        {
          entityId: "entity_broker_1",
          severity: "low",
          riskType: "inventory_review",
          summary: "Review method total",
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
    })
    expect(body.broker_run_id).toStartWith("brun_")
  })

  test("Given broker token is configured When authorization is missing Then request is rejected", async () => {
    const app = createOpencodeBrokerApp({ brokerToken: "shared-secret" })

    const response = await app.request("/spec/analyze", {
      method: "POST",
      body: JSON.stringify({
        protocol_version: 1,
        analysis_type: "risk",
        prompt_version: "risk-v1",
        model: "openai/gpt-5.5",
        input: specInput,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: "unauthorized" })
  })

  test("Given unsupported broker protocol When spec analyze is posted Then validation error is returned", async () => {
    const app = createOpencodeBrokerApp()

    const response = await app.request("/spec/analyze", {
      method: "POST",
      body: JSON.stringify({
        protocol_version: 2,
        analysis_type: "risk",
        prompt_version: "risk-v1",
        model: "openai/gpt-5.5",
        input: specInput,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: "invalid broker analysis request" })
  })

  test("Given Retrospec broker driver When it calls local broker Then analysis response is accepted", async () => {
    const app = createOpencodeBrokerApp({ brokerToken: "driver-secret" })
    const server = Bun.serve({ port: 0, fetch: app.fetch })

    try {
      const driver = selectSpecAnalysisDriver(
        loadSpecProviderConfig({
          RETROSPEC_SPEC_PROVIDER_MODE: "opencode-broker",
          RETROSPEC_SPEC_MODEL: "openai/gpt-5.5",
          RETROSPEC_SPEC_BROKER_URL: server.url.toString(),
          RETROSPEC_SPEC_BROKER_TOKEN: "driver-secret",
        }),
      )

      const result = await driver.analyze(specInput)

      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]?.entityId).toBe("entity_broker_1")
      expect(result.usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      })
    } finally {
      server.stop(true)
    }
  })
})
