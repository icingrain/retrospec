import {
  type ParsedOptions,
  launchSettingsOption,
  normalizeStatusArgs,
  parseOptions,
  requireActor,
  requireJobId,
  requireOption,
} from "./agent-bridge-options"
import {
  ActiveJobConflictHttpError,
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
      await runJobSubmit(endpoint, options)
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

async function runJobSubmit(
  endpoint: Awaited<ReturnType<typeof ensureDaemon>>,
  options: ParsedOptions,
): Promise<void> {
  try {
    printJson(
      await submitJobWithDaemon(endpoint, {
        projectPath: options.projectPath,
        actor: requireActor(options.actor),
        category: requireOption(options.category, "--category"),
        manifestPath: requireOption(options.manifestPath, "--manifest"),
        launchSettings: launchSettingsOption(options),
        replaceExisting: options.replaceExisting,
      }),
    )
  } catch (error) {
    if (error instanceof ActiveJobConflictHttpError) {
      throw new Error(jobConflictMessage(error))
    }
    throw error
  }
}

function jobConflictMessage(error: ActiveJobConflictHttpError): string {
  return [
    "active job already owns this write scope",
    `job_id: ${error.conflict.job_id}`,
    `status: ${error.conflict.status}`,
    `write_scope_key: ${error.conflict.write_scope_key}`,
    "Re-run with --replace-existing to cancel that job and submit a replacement.",
  ].join("\n")
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

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}
