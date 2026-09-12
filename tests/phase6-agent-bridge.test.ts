import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type DaemonServer, startDaemon } from "../src/daemon"
import { runtimePaths } from "../src/paths"
import type { RuntimePaths } from "../src/types"

const daemons: DaemonServer[] = []

afterEach(() => {
  for (const daemon of daemons.splice(0)) {
    daemon.stop()
  }
})

async function tempRuntime(): Promise<RuntimePaths> {
  return runtimePaths(await mkdtemp(join(tmpdir(), "retrospec-runtime-")))
}

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "retrospec-project-"))
}

async function runCli(
  runtime: RuntimePaths,
  args: readonly string[],
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const processHandle = Bun.spawn([process.execPath, "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, RETROSPEC_HOME: runtime.homeDir },
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ])

  return { exitCode, stdout, stderr }
}

async function writeGeneratedProgram(projectRoot: string): Promise<string> {
  const generatedDir = join(projectRoot, ".retrospec", "generated", "retro", "code-inventory")
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, "run.ts")
  const manifestPath = join(generatedDir, "job.json")
  await writeFile(entrypoint, "await Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n")
  await writeFile(
    manifestPath,
    JSON.stringify({
      manifest_version: 1,
      runtime: "bun",
      entrypoint,
      args: [],
      env: {},
      writes: [".retrospec/logs/phase6.log"],
      category: "symbols",
      actor: "retro",
      capability: "code-inventory",
    }),
  )
  await writeFile(
    join(generatedDir, "generation-contract.json"),
    JSON.stringify({
      contract_version: 1,
      project_path: projectRoot,
      actor: "retro",
      skill: "code-inventory",
      categories: ["symbols"],
      status_evidence: { checked: true, summary: "phase6 bridge fixture" },
      survey: {
        languages: ["java"],
        include_paths: ["src"],
        exclude_paths: ["generated"],
        framework_hints: [],
        generated_vendor_test_policy: "skip-generated-vendor-test",
        large_file_policy: "skip-over-1mb",
      },
      language_capability: {
        matrix_path: "templates/generated-program/language-capability-matrix.json",
        language: "java",
        overall_confidence: "high-confidence",
        category_support: [
          {
            category: "symbols",
            support_level: "high-confidence",
            parser_backend: "tree-sitter-java",
            evidence_label: "EXTRACTED",
          },
        ],
        unsupported_categories: [],
      },
      reference_cases: ["templates/fixtures/code-inventory/c-cpp-java-symbols"],
      selected_strategies: [
        {
          name: "java-symbols",
          parser_backend: "tree-sitter-java",
          categories: ["symbols"],
          evidence_label: "EXTRACTED",
        },
      ],
      skipped_strategies: [],
      fallbacks: [],
      expected_writes: [".retrospec/logs/phase6.log"],
      handoff: { status: "ready_for_analysis", reason: "parser-backed fixture" },
      validation_loop: {
        required: true,
        sample_policy: {
          candidate_source: "analysis-target-files",
          eligible_file_count: 1,
          min_count: 3,
          max_count: 12,
          ratio: 0.1,
          strategy: "deterministic-stratified",
          must_cover: ["language", "extension", "requested_category"],
          allow_smaller_target_set: true,
          random_seed: null,
        },
        sample_selection: [
          {
            id: "main-java-symbols",
            path: "src/Main.java",
            selection_reason: "covers parser-backed Java symbol extraction",
            covered_categories: ["symbols"],
            language: "java",
          },
        ],
        expected_evidence_source: "agent-authored-from-source-samples",
        generated_result_source: "dry-run-summary",
        gap_taxonomy: ["bug", "unsupported", "ambiguous", "reference-missing"],
        iteration_limit: 3,
        stop_conditions: [
          "all_required_samples_pass",
          "no_unresolved_bug_gap",
          "iteration_limit_reached",
          "no_meaningful_improvement",
          "repeated_gap",
          "budget_exceeded",
        ],
        report_path: ".retrospec/generated/retro/code-inventory/validation-report.json",
        reference_candidates_path:
          ".retrospec/generated/retro/code-inventory/reference-candidates.jsonl",
        auto_merge_reference_candidates: false,
      },
    }),
  )
  await writeFile(
    join(generatedDir, "validation-report.json"),
    JSON.stringify({
      report_version: 1,
      run_id: "phase6-bridge",
      skill: "code-inventory",
      categories: ["symbols"],
      samples: [
        {
          id: "main-java-symbols",
          path: "src/Main.java",
          selection_reason: "covers parser-backed Java symbol extraction",
          covered_categories: ["symbols"],
        },
      ],
      expected_evidence: [],
      generated_results: [],
      comparisons: [],
      gaps: [],
      iterations: [{ index: 1, outcome: "passed", bug_count: 0 }],
      stop_reason: "all_required_samples_pass",
      status: "passed",
    }),
  )
  return manifestPath
}

describe("Phase 6 agent-facing CLI/API bridge", () => {
  test("Given a project When status --json runs Then agent-readable minimal status is returned", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    daemons.push(await startDaemon(runtime))

    const result = await runCli(runtime, ["status", projectRoot, "--json"])
    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.project.project_path).toBe(projectRoot)
    expect(parsed.dashboard_url).toStartWith("http://127.0.0.1:")
    expect(parsed.retro).toEqual([])
    expect(parsed.spec).toEqual([])
  })

  test("Given a generated program When bridge validates and submits it Then job wrappers control lifecycle", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    daemons.push(await startDaemon(runtime))
    const manifestPath = await writeGeneratedProgram(projectRoot)

    const validation = await runCli(runtime, [
      "generated",
      "validate",
      "--project",
      projectRoot,
      "--manifest",
      manifestPath,
      "--json",
    ])
    const validationBody = JSON.parse(validation.stdout)
    expect(validation.exitCode).toBe(0)
    expect(validationBody).toMatchObject({ status: "approved", blockers: [] })

    const submitted = await runCli(runtime, [
      "job",
      "submit",
      "--project",
      projectRoot,
      "--actor",
      "retro",
      "--category",
      "symbols",
      "--manifest",
      manifestPath,
      "--json",
    ])
    const submittedBody = JSON.parse(submitted.stdout)
    expect(submitted.exitCode).toBe(0)
    expect(submittedBody.status).toBe("queued")

    const awaited = await runCli(runtime, [
      "job",
      "await",
      submittedBody.job_id,
      "--timeout-ms",
      "5000",
      "--json",
    ])
    const awaitedBody = JSON.parse(awaited.stdout)
    expect(awaited.exitCode).toBe(0)
    expect(awaitedBody).toMatchObject({ status: "completed", timed_out: false })

    const inspected = await runCli(runtime, ["job", "inspect", submittedBody.job_id, "--json"])
    const inspectedBody = JSON.parse(inspected.stdout)
    expect(inspected.exitCode).toBe(0)
    expect(inspectedBody.snapshot).toMatchObject({ status: "completed", progress_pct: 100 })
  })

  test("Given no analysis DBs When analysis status runs Then JSON status is empty", async () => {
    const runtime = await tempRuntime()
    const projectRoot = await tempProject()
    daemons.push(await startDaemon(runtime))

    const result = await runCli(runtime, ["analysis", "status", "--project", projectRoot, "--json"])
    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed).toEqual({ retro: [], spec: [] })
  })
})
