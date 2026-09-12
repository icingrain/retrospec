import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "retrospec-project-"))
}

export async function writeGeneratedProgram(
  projectRoot: string,
  contract: Record<string, unknown>,
  report: Record<string, unknown> = validationReport(),
): Promise<string> {
  return writeProgram(projectRoot, contract, report, true)
}

export async function writeGeneratedProgramWithoutCapability(
  projectRoot: string,
  contract: Record<string, unknown>,
): Promise<string> {
  return writeProgram(projectRoot, contract, validationReport(), false)
}

export async function writeReferenceCandidate(
  projectRoot: string,
  value: Record<string, unknown>,
): Promise<void> {
  const generatedDir = generatedPath(projectRoot)
  await writeFile(join(generatedDir, "reference-candidates.jsonl"), `${JSON.stringify(value)}\n`)
}

export function validationReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    report_version: 1,
    run_id: "phase7-test",
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
    ...overrides,
  }
}

export function parserContract(projectRoot: string): Record<string, unknown> {
  return {
    contract_version: 1,
    project_path: projectRoot,
    actor: "retro",
    skill: "code-inventory",
    categories: ["symbols"],
    status_evidence: { checked: true, summary: "retro/spec empty before generated run" },
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
        name: "java-class-method-symbols",
        parser_backend: "tree-sitter-java",
        categories: ["symbols"],
        evidence_label: "EXTRACTED",
      },
    ],
    skipped_strategies: [{ name: "proc-symbols", reason: "no Pro*C files in survey" }],
    fallbacks: [],
    expected_writes: [".retrospec/logs/phase7.log"],
    handoff: { status: "ready_for_analysis", reason: "parser-backed symbol coverage" },
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
  }
}

async function writeProgram(
  projectRoot: string,
  contract: Record<string, unknown>,
  report: Record<string, unknown>,
  includeCapability: boolean,
): Promise<string> {
  const generatedDir = generatedPath(projectRoot)
  await mkdir(generatedDir, { recursive: true })
  const entrypoint = join(generatedDir, "run.ts")
  const manifestPath = join(generatedDir, "job.json")
  await writeFile(entrypoint, "await Bun.write(process.env.RETROSPEC_JOB_OUTPUT, 'ok')\n")
  await writeFile(manifestPath, JSON.stringify(manifest(entrypoint, includeCapability)))
  await writeFile(join(generatedDir, "generation-contract.json"), JSON.stringify(contract))
  await writeFile(join(generatedDir, "validation-report.json"), JSON.stringify(report))
  return manifestPath
}

function manifest(entrypoint: string, includeCapability: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    manifest_version: 1,
    runtime: "bun",
    entrypoint,
    args: [],
    env: {},
    writes: [".retrospec/logs/phase7.log"],
    category: "symbols",
    actor: "retro",
  }
  if (includeCapability) {
    body["capability"] = "code-inventory"
  }
  return body
}

function generatedPath(projectRoot: string): string {
  return join(projectRoot, ".retrospec", "generated", "retro", "code-inventory")
}
