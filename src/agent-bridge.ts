import { normalizeAnalysisLaunchControls } from "./analysis-launch-controls"
import {
  analysisStatus,
  awaitJobWithDaemon,
  cancelJobWithDaemon,
  generateExportsWithDaemon,
  inspectJobWithDaemon,
  listJobsWithDaemon,
  regenerateExportsWithDaemon,
  submitJobWithDaemon,
  validateGeneratedWithDaemon,
} from "./client"
import { ensureDaemon } from "./discovery"
import { routerSummary } from "./router"
import type { AnalysisLaunchControls, JobActor } from "./types"

type ParsedOptions = {
  readonly projectPath: string
  readonly json: boolean
  readonly actor: JobActor | undefined
  readonly category: string | undefined
  readonly manifestPath: string | undefined
  readonly jobId: string | undefined
  readonly timeoutMs: number | undefined
  readonly format: "csv" | "xlsx" | undefined
  readonly excludeFolders: readonly string[]
  readonly excludeExtensions: readonly string[]
  readonly batchSize: number | undefined
  readonly workerCount: number | undefined
}

export async function runAgentBridgeCommand(args: readonly string[]): Promise<boolean> {
  const [command, subcommand] = args
  if (command === "analysis" && subcommand === "status") {
    await runAnalysisStatus(args.slice(2))
    return true
  }
  if (command === "job") {
    await runJob(args.slice(1))
    return true
  }
  if (command === "exports") {
    await runExports(args.slice(1))
    return true
  }
  if (command === "generated" && subcommand === "validate") {
    await runGeneratedValidate(args.slice(2))
    return true
  }
  return false
}

async function runExports(args: readonly string[]): Promise<void> {
  const [action, ...rest] = args
  const options = parseOptions(rest)
  const endpoint = await ensureDaemon()

  switch (action) {
    case "generate":
      printJson(
        await generateExportsWithDaemon(endpoint, options.projectPath, options.format ?? "xlsx"),
      )
      return
    case "regenerate":
      printJson(await regenerateExportsWithDaemon(endpoint, options.projectPath))
      return
    default:
      throw new Error(
        "Usage: retrospec exports generate|regenerate --project <path> [--format csv|xlsx] --json",
      )
  }
}

export async function runStatus(args: readonly string[]): Promise<void> {
  const options = parseOptions(normalizeStatusArgs(args))
  const summary = await routerSummary(options.projectPath)
  if (options.json) {
    printJson({
      daemon: summary.daemon,
      project: summary.project,
      dashboard_url: summary.dashboardUrl,
      state: summary.hasRetrospecState ? "existing" : "created",
      retro: summary.retroStatuses,
      spec: summary.specStatuses,
      next_action: summary.nextAction,
    })
    return
  }

  const { formatRouterSummary } = await import("./router")
  console.log(formatRouterSummary(summary))
}

async function runAnalysisStatus(args: readonly string[]): Promise<void> {
  const options = parseOptions(args)
  const endpoint = await ensureDaemon()
  printJson(await analysisStatus(endpoint, options.projectPath))
}

async function runJob(args: readonly string[]): Promise<void> {
  const [action, ...rest] = args
  const options = parseOptions(rest)
  const endpoint = await ensureDaemon()

  switch (action) {
    case "submit":
      printJson(
        await submitJobWithDaemon(endpoint, {
          projectPath: options.projectPath,
          actor: requireActor(options.actor),
          category: requireOption(options.category, "--category"),
          manifestPath: requireOption(options.manifestPath, "--manifest"),
          launchSettings: launchSettingsOption(options),
        }),
      )
      return
    case "list":
      printJson(await listJobsWithDaemon(endpoint, options.projectPath))
      return
    case "inspect":
      printJson(await inspectJobWithDaemon(endpoint, requireJobId(options.jobId)))
      return
    case "await":
      printJson(
        await awaitJobWithDaemon(endpoint, requireJobId(options.jobId), options.timeoutMs ?? 5_000),
      )
      return
    case "cancel":
      printJson(await cancelJobWithDaemon(endpoint, requireJobId(options.jobId)))
      return
    default:
      throw new Error("Usage: retrospec job submit|list|inspect|await|cancel ... --json")
  }
}

async function runGeneratedValidate(args: readonly string[]): Promise<void> {
  const options = parseOptions(args)
  const endpoint = await ensureDaemon()
  printJson(
    await validateGeneratedWithDaemon(
      endpoint,
      options.projectPath,
      requireOption(options.manifestPath, "--manifest"),
    ),
  )
}

function parseOptions(args: readonly string[]): ParsedOptions {
  let projectPath = process.cwd()
  let json = false
  let actor: JobActor | undefined
  let category: string | undefined
  let manifestPath: string | undefined
  let jobId: string | undefined
  let timeoutMs: number | undefined
  let format: "csv" | "xlsx" | undefined
  const excludeFolders: string[] = []
  const excludeExtensions: string[] = []
  let batchSize: number | undefined
  let workerCount: number | undefined

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === undefined) {
      continue
    }
    if (token === "--json") {
      json = true
      continue
    }
    if (token === "--project") {
      projectPath = requireNext(args, index, token)
      index += 1
      continue
    }
    if (token === "--actor") {
      actor = parseActor(requireNext(args, index, token))
      index += 1
      continue
    }
    if (token === "--category") {
      category = requireNext(args, index, token)
      index += 1
      continue
    }
    if (token === "--manifest") {
      manifestPath = requireNext(args, index, token)
      index += 1
      continue
    }
    if (token === "--timeout-ms") {
      timeoutMs = parseTimeout(requireNext(args, index, token))
      index += 1
      continue
    }
    if (token === "--format") {
      format = parseFormat(requireNext(args, index, token))
      index += 1
      continue
    }
    if (token === "--exclude-folder") {
      excludeFolders.push(requireNext(args, index, token))
      index += 1
      continue
    }
    if (token === "--exclude-extension") {
      excludeExtensions.push(requireNext(args, index, token))
      index += 1
      continue
    }
    if (token === "--batch-size") {
      batchSize = parseTimeout(requireNext(args, index, token))
      index += 1
      continue
    }
    if (token === "--worker-count") {
      workerCount = parseTimeout(requireNext(args, index, token))
      index += 1
      continue
    }
    if (!token.startsWith("--") && jobId === undefined) {
      jobId = token
      continue
    }
    if (!token.startsWith("--") && projectPath === process.cwd()) {
      projectPath = token
      continue
    }
    throw new Error(`Unknown option: ${token}`)
  }

  return {
    projectPath,
    json,
    actor,
    category,
    manifestPath,
    jobId,
    timeoutMs,
    format,
    excludeFolders,
    excludeExtensions,
    batchSize,
    workerCount,
  }
}

function launchSettingsOption(options: ParsedOptions): AnalysisLaunchControls | undefined {
  if (
    options.excludeFolders.length === 0 &&
    options.excludeExtensions.length === 0 &&
    options.batchSize === undefined &&
    options.workerCount === undefined
  ) {
    return undefined
  }
  return normalizeAnalysisLaunchControls({
    excludeFolders: options.excludeFolders,
    excludeExtensions: options.excludeExtensions,
    batchSize: options.batchSize,
    workerCount: options.workerCount,
  })
}

function normalizeStatusArgs(args: readonly string[]): readonly string[] {
  const [first, ...rest] = args
  if (first !== undefined && !first.startsWith("--")) {
    return ["--project", first, ...rest]
  }
  return args
}

function parseActor(value: string): JobActor {
  if (value === "retro" || value === "spec" || value === "archivist") {
    return value
  }
  throw new Error("--actor must be retro, spec, or archivist")
}

function parseTimeout(value: string): number {
  const timeoutMs = Number.parseInt(value, 10)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
    throw new Error("--timeout-ms must be a non-negative integer")
  }
  return timeoutMs
}

function parseFormat(value: string): "csv" | "xlsx" {
  if (value === "csv" || value === "xlsx") {
    return value
  }
  throw new Error("--format must be csv or xlsx")
}

function requireNext(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function requireActor(actor: JobActor | undefined): JobActor {
  if (actor === undefined) {
    throw new Error("--actor is required")
  }
  return actor
}

function requireJobId(jobId: string | undefined): string {
  return requireOption(jobId, "job_id")
}

function requireOption(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is required`)
  }
  return value
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}
