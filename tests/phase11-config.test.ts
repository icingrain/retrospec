import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import {
  loadRetrospecAgentModelConfig,
  loadSpecProviderConfig,
  resolveRetrospecAgentModel,
} from "../src/config"
import { projectPaths } from "../src/paths"
import { runRetroInventory } from "../src/retro/run"
import { selectSpecAnalysisDriver } from "../src/spec-analysis"
import { runSpecAnalysis } from "../src/spec/run"
import { tempProject, writeSampleProject } from "./phase3-helpers"

describe("Phase 11.2 provider config", () => {
  test("Given no provider config When config is loaded Then deterministic driver remains selected", () => {
    const config = loadSpecProviderConfig({})
    const driver = selectSpecAnalysisDriver(config)

    expect(config).toEqual({ mode: "deterministic" })
    expect(driver.model).toBe("deterministic-risk-v1")
    expect(driver.promptVersion).toBe("risk-v1")
  })

  test("Given provider model and API key When config is loaded Then provider driver metadata is selected", () => {
    const config = loadSpecProviderConfig({
      RETROSPEC_SPEC_PROVIDER: "openai",
      RETROSPEC_SPEC_MODEL: "gpt-5.5",
      RETROSPEC_SPEC_API_KEY: "test-key",
    })
    const driver = selectSpecAnalysisDriver(config)

    expect(config).toEqual({
      mode: "env-provider",
      provider: "openai",
      model: "gpt-5.5",
      apiKey: "test-key",
    })
    expect(driver.model).toBe("openai:gpt-5.5")
    expect(driver.promptVersion).toBe("risk-v1")
  })

  test("Given incomplete provider config When config is loaded Then missing field is rejected", () => {
    expect(() =>
      loadSpecProviderConfig({
        RETROSPEC_SPEC_PROVIDER: "openai",
        RETROSPEC_SPEC_MODEL: "gpt-5.5",
      }),
    ).toThrow(
      "provider config requires RETROSPEC_SPEC_PROVIDER, RETROSPEC_SPEC_MODEL, and RETROSPEC_SPEC_API_KEY",
    )
  })

  test("Given no agent model config When agent models are loaded Then every retrospec agent uses the default model", () => {
    const config = loadRetrospecAgentModelConfig({})

    expect(config).toEqual({
      defaultModel: "openai/gpt-5.5",
      agents: {
        Excavator: "openai/gpt-5.5",
        Surveyor: "openai/gpt-5.5",
        Curator: "openai/gpt-5.5",
        Archivist: "openai/gpt-5.5",
        Appraiser: "openai/gpt-5.5",
      },
    })
  })

  test("Given default and per-agent model overrides When agent model resolves Then explicit agent override wins", () => {
    const env = {
      RETROSPEC_AGENT_MODEL: "openai:gpt-5.5",
      RETROSPEC_AGENT_MODEL_CURATOR: "anthropic:claude-3-5-sonnet-latest",
    }

    const config = loadRetrospecAgentModelConfig(env)

    expect(config.agents.Curator).toBe("anthropic/claude-3-5-sonnet-latest")
    expect(config.agents.Excavator).toBe("openai/gpt-5.5")
    expect(resolveRetrospecAgentModel("Curator", env)).toBe("anthropic/claude-3-5-sonnet-latest")
  })

  test("Given provider environment When spec analysis runs Then configured driver metadata is stored", async () => {
    const previousProvider = process.env["RETROSPEC_SPEC_PROVIDER"]
    const previousModel = process.env["RETROSPEC_SPEC_MODEL"]
    const previousApiKey = process.env["RETROSPEC_SPEC_API_KEY"]
    const previousBaseUrl = process.env["RETROSPEC_SPEC_BASE_URL"]
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({ findings: [] }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      },
    })

    process.env["RETROSPEC_SPEC_PROVIDER"] = "openai"
    process.env["RETROSPEC_SPEC_MODEL"] = "gpt-5.5"
    process.env["RETROSPEC_SPEC_API_KEY"] = "test-key"
    process.env["RETROSPEC_SPEC_BASE_URL"] = `${server.url}v1`
    try {
      const projectRoot = await tempProject()
      await writeSampleProject(projectRoot)
      await runRetroInventory(projectRoot)
      const paths = projectPaths(projectRoot)

      const result = await runSpecAnalysis(paths)

      const db = new Database(paths.specAnalysisDb, { readonly: true })
      try {
        const run = db
          .query<{ readonly model: string; readonly prompt_version: string }, [string]>(
            "select model, prompt_version from analysis_runs where analysis_run_id = ?",
          )
          .get(result.analysisRunId)

        expect(run).toEqual({ model: "openai:gpt-5.5", prompt_version: "risk-v1" })
      } finally {
        db.close()
      }
    } finally {
      restoreEnvValue("RETROSPEC_SPEC_PROVIDER", previousProvider)
      restoreEnvValue("RETROSPEC_SPEC_MODEL", previousModel)
      restoreEnvValue("RETROSPEC_SPEC_API_KEY", previousApiKey)
      restoreEnvValue("RETROSPEC_SPEC_BASE_URL", previousBaseUrl)
      server.stop(true)
    }
  })
})

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
