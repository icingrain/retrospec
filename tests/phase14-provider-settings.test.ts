import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { loadSpecProviderConfig } from "../src/config"
import { projectPaths } from "../src/paths"
import { readSpecProviderSettings, writeSpecProviderSettings } from "../src/provider-settings"
import { runRetroInventory } from "../src/retro/run"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 14 provider settings foundation", () => {
  test("Given project provider settings When settings are saved Then they can be read without secrets", async () => {
    const projectRoot = await tempProject()
    const paths = projectPaths(projectRoot)

    const saved = await writeSpecProviderSettings(paths, {
      mode: "opencode-broker",
      model: "openai/gpt-5.5",
      brokerUrl: "http://127.0.0.1:9000",
    })

    expect(saved.settings).toEqual({
      mode: "opencode-broker",
      model: "openai/gpt-5.5",
      brokerUrl: "http://127.0.0.1:9000",
      secretSource: "env",
    })
    expect(await readSpecProviderSettings(paths)).toEqual(saved)
    expect(JSON.stringify(saved)).not.toContain("TOKEN")
  })

  test("Given saved broker settings and env provider config When config resolves Then saved settings win", () => {
    const config = loadSpecProviderConfig(
      {
        RETROSPEC_SPEC_PROVIDER: "openai",
        RETROSPEC_SPEC_MODEL: "gpt-env",
        RETROSPEC_SPEC_API_KEY: "env-secret",
      },
      {
        mode: "opencode-broker",
        model: "openai/gpt-5.5",
        brokerUrl: "http://127.0.0.1:9000",
        secretSource: "env",
      },
    )

    expect(config).toEqual({
      mode: "opencode-broker",
      model: "openai/gpt-5.5",
      brokerUrl: "http://127.0.0.1:9000",
    })
  })

  test("Given saved broker settings When spec analysis runs Then saved broker driver is used", async () => {
    const receivedRequests: unknown[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = await request.json()
        receivedRequests.push(body)
        return Response.json({ findings: [] })
      },
    })

    try {
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      const paths = projectPaths(projectRoot)
      await writeSpecProviderSettings(paths, {
        mode: "opencode-broker",
        model: "openai/gpt-5.5",
        brokerUrl: server.url.toString(),
      })

      const result = await runSpecAnalysis(paths)

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<{ readonly provider_mode: string; readonly model: string }, [string]>(
            "select provider_mode, model from analysis_runs where analysis_run_id = ?",
          )
          .get(result.analysisRunId)

        expect(receivedRequests).toHaveLength(1)
        expect(receivedRequests[0]).toMatchObject({
          protocol_version: 1,
          analysis_type: "risk",
          prompt_version: "risk-v1",
          model: "openai/gpt-5.5",
        })
        expect(run).toEqual({
          provider_mode: "opencode-broker",
          model: "opencode-broker:openai/gpt-5.5",
        })
      } finally {
        db.close()
      }
    } finally {
      server.stop(true)
    }
  })
})
