import {
  type AnalysisLaunchControls,
  normalizeAnalysisLaunchControls,
} from "./analysis-launch-controls"
import type { JobActor } from "./types"

export type ParsedOptions = {
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
  readonly replaceExisting: boolean
}

export function parseOptions(args: readonly string[]): ParsedOptions {
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
  let replaceExisting = false

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
    if (token === "--replace-existing") {
      replaceExisting = true
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
    replaceExisting,
  }
}

export function launchSettingsOption(options: ParsedOptions): AnalysisLaunchControls | undefined {
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

export function normalizeStatusArgs(args: readonly string[]): readonly string[] {
  const [first, ...rest] = args
  if (first !== undefined && !first.startsWith("--")) {
    return ["--project", first, ...rest]
  }
  return args
}

export function requireActor(actor: JobActor | undefined): JobActor {
  if (actor === undefined) {
    throw new Error("--actor is required")
  }
  return actor
}

export function requireJobId(jobId: string | undefined): string {
  return requireOption(jobId, "job_id")
}

export function requireOption(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is required`)
  }
  return value
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
