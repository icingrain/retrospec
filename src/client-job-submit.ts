import ky, { HTTPError } from "ky"
import { activeJobConflictResponseSchema, submitJobResponseSchema } from "./schemas"
import type { AnalysisLaunchControls, DaemonEndpoint, JobActor, SubmitJobResponse } from "./types"

export type ActiveJobConflictResponse = ReturnType<typeof activeJobConflictResponseSchema.parse>

export type SubmitJobWithDaemonRequest = {
  readonly projectPath: string
  readonly actor: JobActor
  readonly category: string
  readonly manifestPath: string
  readonly launchSettings?: AnalysisLaunchControls | undefined
  readonly writeScopeKey?: string
  readonly replaceExisting?: boolean
}

export class ActiveJobConflictHttpError extends Error {
  readonly conflict: ActiveJobConflictResponse["conflict"]

  constructor(response: ActiveJobConflictResponse) {
    super(response.error)
    this.name = "ActiveJobConflictHttpError"
    this.conflict = response.conflict
  }
}

export async function submitJobWithDaemon(
  endpoint: DaemonEndpoint,
  request: SubmitJobWithDaemonRequest,
): Promise<SubmitJobResponse> {
  const body = await submitJobRequest(endpoint, request)

  return submitJobResponseSchema.parse(body)
}

async function submitJobRequest(
  endpoint: DaemonEndpoint,
  request: SubmitJobWithDaemonRequest,
): Promise<unknown> {
  try {
    return await ky
      .post("jobs", {
        prefixUrl: endpoint.baseUrl,
        headers: { Authorization: `Bearer ${endpoint.token}` },
        json: submitJobPayload(request),
        timeout: 1_000,
      })
      .json()
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 409) {
      throw await activeJobConflictError(error)
    }
    throw error
  }
}

function submitJobPayload(request: SubmitJobWithDaemonRequest): Record<string, unknown> {
  return {
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
            spec_template: request.launchSettings.specTemplate,
          },
        }),
    ...(request.writeScopeKey === undefined ? {} : { write_scope_key: request.writeScopeKey }),
    ...(request.replaceExisting === undefined ? {} : { replace_existing: request.replaceExisting }),
  }
}

async function activeJobConflictError(error: HTTPError): Promise<ActiveJobConflictHttpError> {
  const responseBody: unknown = await error.response.clone().json()
  return new ActiveJobConflictHttpError(activeJobConflictResponseSchema.parse(responseBody))
}
