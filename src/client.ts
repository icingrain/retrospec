import ky from "ky"
import {
  analysisStatusResponseSchema,
  awaitJobResponseSchema,
  exportListResponseSchema,
  generatedValidationResponseSchema,
  jobDetailResponseSchema,
  jobListResponseSchema,
  registerProjectResponseSchema,
  submitJobResponseSchema,
} from "./schemas"
import type {
  AnalysisLaunchControls,
  AnalysisStatusResponse,
  AwaitJobResponse,
  DaemonEndpoint,
  ExportFileRecord,
  GeneratedValidationResponse,
  JobActor,
  JobDetailResponse,
  JobId,
  JobListResponse,
  RegisterProjectResponse,
  SubmitJobResponse,
} from "./types"

export async function registerProjectWithDaemon(
  endpoint: DaemonEndpoint,
  projectPath: string,
): Promise<RegisterProjectResponse> {
  const body = await ky
    .post("projects/register", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectPath },
      timeout: 1_000,
    })
    .json()

  return registerProjectResponseSchema.parse(body)
}

export async function analysisStatus(
  endpoint: DaemonEndpoint,
  projectPath: string,
): Promise<AnalysisStatusResponse> {
  const body = await ky
    .get("analysis/status", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      searchParams: { project_path: projectPath },
      timeout: 1_000,
    })
    .json()

  return analysisStatusResponseSchema.parse(body)
}

export async function submitJobWithDaemon(
  endpoint: DaemonEndpoint,
  request: {
    readonly projectPath: string
    readonly actor: JobActor
    readonly category: string
    readonly manifestPath: string
    readonly launchSettings?: AnalysisLaunchControls | undefined
    readonly writeScopeKey?: string
    readonly replaceExisting?: boolean
  },
): Promise<SubmitJobResponse> {
  const body = await ky
    .post("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: {
        project_path: request.projectPath,
        actor: request.actor,
        category: request.category,
        manifest_path: request.manifestPath,
        ...(request.launchSettings === undefined
          ? {}
          : {
              launch_settings: {
                scope: request.launchSettings.scope,
                exclude_folders: request.launchSettings.excludeFolders,
                exclude_extensions: request.launchSettings.excludeExtensions,
                batch_size: request.launchSettings.batchSize,
                worker_count: request.launchSettings.workerCount,
              },
            }),
        ...(request.writeScopeKey === undefined ? {} : { write_scope_key: request.writeScopeKey }),
        ...(request.replaceExisting === undefined
          ? {}
          : { replace_existing: request.replaceExisting }),
      },
      timeout: 1_000,
    })
    .json()

  return submitJobResponseSchema.parse(body)
}

export async function listJobsWithDaemon(
  endpoint: DaemonEndpoint,
  projectPath: string,
): Promise<JobListResponse> {
  const body = await ky
    .get("jobs", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      searchParams: { project_path: projectPath },
      timeout: 1_000,
    })
    .json()

  return jobListResponseSchema.parse(body)
}

export async function inspectJobWithDaemon(
  endpoint: DaemonEndpoint,
  jobId: JobId,
): Promise<JobDetailResponse> {
  const body = await ky
    .get(`jobs/${jobId}`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      timeout: 1_000,
    })
    .json()

  return jobDetailResponseSchema.parse(body)
}

export async function awaitJobWithDaemon(
  endpoint: DaemonEndpoint,
  jobId: JobId,
  timeoutMs: number,
): Promise<AwaitJobResponse> {
  const body = await ky
    .post(`jobs/${jobId}/await`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { timeout_ms: timeoutMs },
      timeout: Math.max(timeoutMs + 1_000, 1_000),
    })
    .json()

  return awaitJobResponseSchema.parse(body)
}

export async function cancelJobWithDaemon(
  endpoint: DaemonEndpoint,
  jobId: JobId,
): Promise<{ readonly job_id: JobId; readonly status: "cancelled" }> {
  return ky
    .post(`jobs/${jobId}/cancel`, {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      timeout: 1_000,
    })
    .json()
}

export async function generateExportsWithDaemon(
  endpoint: DaemonEndpoint,
  projectPath: string,
  format: "csv" | "xlsx",
): Promise<{ readonly exports: readonly ExportFileRecord[] }> {
  const body = await ky
    .post("exports/generate", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectPath, format },
      timeout: 5_000,
    })
    .json()

  return normalizeExportListResponse(exportListResponseSchema.parse(body))
}

export async function regenerateExportsWithDaemon(
  endpoint: DaemonEndpoint,
  projectPath: string,
): Promise<{ readonly exports: readonly ExportFileRecord[] }> {
  const body = await ky
    .post("exports/regenerate", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectPath },
      timeout: 5_000,
    })
    .json()

  return normalizeExportListResponse(exportListResponseSchema.parse(body))
}

function normalizeExportListResponse(response: {
  readonly exports: readonly ReturnType<typeof exportListResponseSchema.parse>["exports"][number][]
}): { readonly exports: readonly ExportFileRecord[] } {
  return { exports: response.exports.map(normalizeExportFileRecord) }
}

function normalizeExportFileRecord(
  record: ReturnType<typeof exportListResponseSchema.parse>["exports"][number],
): ExportFileRecord {
  return {
    file_id: record.file_id,
    file_name: record.file_name,
    format: record.format,
    size_bytes: record.size_bytes,
    created_at: record.created_at,
    download_url: record.download_url,
    ...(record.category === undefined ? {} : { category: record.category }),
    ...(record.input_db_paths === undefined ? {} : { input_db_paths: record.input_db_paths }),
    ...(record.source_fingerprint === undefined
      ? {}
      : { source_fingerprint: record.source_fingerprint }),
    ...(record.analysis_run_id === undefined ? {} : { analysis_run_id: record.analysis_run_id }),
    ...(record.glossary_reconciliation === undefined
      ? {}
      : { glossary_reconciliation: record.glossary_reconciliation }),
  }
}

export async function validateGeneratedWithDaemon(
  endpoint: DaemonEndpoint,
  projectPath: string,
  manifestPath: string,
): Promise<GeneratedValidationResponse> {
  const body = await ky
    .post("generated/validate", {
      prefixUrl: endpoint.baseUrl,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      json: { project_path: projectPath, manifest_path: manifestPath },
      timeout: 1_000,
    })
    .json()

  return generatedValidationResponseSchema.parse(body)
}
