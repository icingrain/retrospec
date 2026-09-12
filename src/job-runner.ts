import { existsSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { z } from "zod"
import { validateGeneratedProgram } from "./generated-validation"
import { runBuiltInCodeInventory, runBuiltInSpecAnalysis } from "./job-builtins"
import { resolveSubmittedAnalysisLaunchControls } from "./job-scope"
import { appendJobEvent, createJob, inspectJob, updateJob } from "./jobs"
import { projectPaths } from "./paths"
import type {
  AnalysisLaunchControls,
  AnalysisScope,
  JobId,
  ProjectPaths,
  SubmitJobRequest,
  SubmitJobResponse,
} from "./types"

const jobManifestSchema = z.object({
  manifest_version: z.literal(1),
  runtime: z.literal("bun"),
  entrypoint: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()),
  writes: z.array(z.string()),
  category: z.string().min(1),
  actor: z.union([z.literal("retro"), z.literal("spec"), z.literal("archivist")]),
  capability: z.union([z.literal("code-inventory"), z.literal("ai-analysis")]).optional(),
  analysis_scope: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("full"), roots: z.array(z.string()).default([]) }),
      z.object({ mode: z.literal("partial"), roots: z.array(z.string().min(1)).min(1) }),
    ])
    .optional(),
})

type ParsedJobManifest = z.infer<typeof jobManifestSchema>

type JobManifest = Omit<ParsedJobManifest, "analysis_scope"> & {
  readonly analysis_scope?: AnalysisScope | undefined
  readonly launch_settings?: AnalysisLaunchControls | undefined
}

const runningProcesses = new Map<JobId, ReturnType<typeof Bun.spawn>>()

export async function submitJob(request: SubmitJobRequest): Promise<SubmitJobResponse> {
  const paths = projectPaths(request.project_path)
  const manifest = await loadSafeManifest(paths, request.manifest_path)

  if (manifest.actor !== request.actor || manifest.category !== request.category) {
    throw new Error("manifest actor or category does not match submit request")
  }
  await enforceGeneratedValidationGate(paths, request.manifest_path)
  const launchSettings = await resolveSubmittedAnalysisLaunchControls(paths, request, manifest)

  const submitted = await createJob({
    ...request,
    project_path: paths.projectRoot,
    scope: launchSettings.scope,
    launch_settings: launchSettings,
  })
  if (submitted.replaced_job_id !== undefined) {
    stopRunningProcess(submitted.replaced_job_id)
  }
  void runJob(paths, submitted.job_id, {
    ...manifest,
    analysis_scope: launchSettings.scope,
    launch_settings: launchSettings,
  })
  return submitted
}

async function enforceGeneratedValidationGate(
  paths: ProjectPaths,
  manifestPath: string,
): Promise<void> {
  const resolvedManifestPath = resolveManifestPath(paths.projectRoot, manifestPath)
  const generatedDir = dirname(resolvedManifestPath)
  const hasGeneratedValidationArtifacts =
    existsSync(joinGeneratedFile(generatedDir, "generation-contract.json")) ||
    existsSync(joinGeneratedFile(generatedDir, "validation-report.json"))

  if (!hasGeneratedValidationArtifacts) {
    return
  }

  const validation = await validateGeneratedProgram(paths.projectRoot, manifestPath)
  if (validation.status === "blocked") {
    throw new Error(`generated program validation blocked: ${validation.blockers.join(", ")}`)
  }
}

function joinGeneratedFile(directory: string, fileName: string): string {
  return resolve(directory, fileName)
}

export async function cancelJob(
  paths: ProjectPaths,
  jobId: JobId,
  payload = "{}",
): Promise<{ readonly job_id: JobId; readonly status: "cancelled" }> {
  const processHandle = runningProcesses.get(jobId)
  processHandle?.kill()
  runningProcesses.delete(jobId)
  await updateJob(paths, jobId, "cancelled", 0, "cancelled")
  await appendJobEvent(paths, jobId, "cancelled", payload)
  return { job_id: jobId, status: "cancelled" }
}

function stopRunningProcess(jobId: JobId): void {
  const processHandle = runningProcesses.get(jobId)
  processHandle?.kill()
  runningProcesses.delete(jobId)
}

async function runJob(paths: ProjectPaths, jobId: JobId, manifest: JobManifest): Promise<void> {
  const queuedDetail = await inspectJob(paths, jobId)
  if (queuedDetail?.snapshot.status === "cancelled") {
    return
  }

  await updateJob(paths, jobId, "running", 0, "running")
  await appendJobEvent(paths, jobId, "started")

  if (manifest.capability === "code-inventory") {
    await runBuiltInCodeInventory(paths, jobId, manifest)
    return
  }

  if (manifest.capability === "ai-analysis") {
    await runBuiltInSpecAnalysis(paths, jobId, manifest)
    return
  }

  const entrypoint = resolveManifestPath(paths.projectRoot, manifest.entrypoint)
  const writeTargets = manifest.writes.map((target) =>
    resolveManifestPath(paths.projectRoot, target),
  )
  const firstWrite = writeTargets[0] ?? resolve(paths.stateDir, "logs", `${jobId}.log`)
  await mkdir(dirname(firstWrite), { recursive: true })

  const processHandle = Bun.spawn([process.execPath, "run", entrypoint, ...manifest.args], {
    cwd: paths.projectRoot,
    env: {
      ...process.env,
      ...manifest.env,
      RETROSPEC_PROJECT_ROOT: paths.projectRoot,
      RETROSPEC_JOB_ID: jobId,
      RETROSPEC_JOB_OUTPUT: firstWrite,
    },
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  })
  runningProcesses.set(jobId, processHandle)
  const exitCode = await processHandle.exited
  runningProcesses.delete(jobId)

  const detail = await inspectJob(paths, jobId)
  if (detail?.snapshot.status === "cancelled") {
    return
  }

  if (exitCode === 0) {
    await updateJob(paths, jobId, "completed", 100, "completed")
    await appendJobEvent(paths, jobId, "completed")
    return
  }

  await updateJob(paths, jobId, "failed", 100, "failed")
  await appendJobEvent(paths, jobId, "failed", JSON.stringify({ exit_code: exitCode }))
}

async function loadSafeManifest(paths: ProjectPaths, manifestPath: string): Promise<JobManifest> {
  const resolvedManifestPath = resolveManifestPath(paths.projectRoot, manifestPath)
  assertInside(resolve(paths.stateDir, "generated"), resolvedManifestPath)
  const manifest = jobManifestSchema.parse(JSON.parse(await readFile(resolvedManifestPath, "utf8")))
  assertInside(
    resolve(paths.stateDir, "generated"),
    resolveManifestPath(paths.projectRoot, manifest.entrypoint),
  )

  for (const writePath of manifest.writes) {
    assertInside(paths.stateDir, resolveManifestPath(paths.projectRoot, writePath))
  }

  return manifest
}

function resolveManifestPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(projectRoot, path)
}

function assertInside(root: string, candidate: string): void {
  const relativePath = relative(root, candidate)
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("path is outside the allowed sandbox")
  }
}
