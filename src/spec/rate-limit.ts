import type { JobId } from "../types"

const defaultCapacity = 1
const defaultRefillPerSecond = 20

export type SpecRateLimitReservationRequest = {
  readonly projectPath: string
  readonly jobId: JobId
  readonly nowMs?: number
}

export type SpecRateLimitReservation = {
  readonly status: "granted" | "delayed"
  readonly project_path: string
  readonly job_id: JobId
  readonly wait_ms: number
  readonly available_at_ms: number
  readonly reason: "global_spec_rate_limit"
}

export type SpecRateLimitSchedulerOptions = {
  readonly capacity?: number
  readonly refillPerSecond?: number
}

export class SpecRateLimitScheduler {
  private readonly capacity: number
  private readonly refillPerSecond: number
  private availableAtMs = 0

  constructor(options: SpecRateLimitSchedulerOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? defaultCapacity)
    this.refillPerSecond = Math.max(1, options.refillPerSecond ?? defaultRefillPerSecond)
  }

  reserve(request: SpecRateLimitReservationRequest): SpecRateLimitReservation {
    const nowMs = request.nowMs ?? Date.now()
    const intervalMs = 1_000 / this.refillPerSecond
    const grantAtMs = Math.max(nowMs, this.availableAtMs)
    const waitMs = Math.max(0, Math.ceil(grantAtMs - nowMs))
    const status = waitMs === 0 ? "granted" : "delayed"
    this.availableAtMs = grantAtMs + intervalMs / this.capacity

    return {
      status,
      project_path: request.projectPath,
      job_id: request.jobId,
      wait_ms: waitMs,
      available_at_ms: Math.ceil(grantAtMs),
      reason: "global_spec_rate_limit",
    }
  }
}

export function createSpecRateLimitScheduler(
  options: SpecRateLimitSchedulerOptions = {},
): SpecRateLimitScheduler {
  return new SpecRateLimitScheduler(options)
}

export const globalSpecRateLimitScheduler = createSpecRateLimitScheduler()
