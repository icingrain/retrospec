import { createHash, randomBytes } from "node:crypto"
import { randomUUID } from "node:crypto"
import type { AuthToken, JobId, ProjectId } from "./types"

export function createAuthToken(): AuthToken {
  return `rtok_${randomBytes(24).toString("base64url")}`
}

export function createProjectId(projectPath: string): ProjectId {
  const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 16)
  return `prj_${hash}`
}

export function createJobId(now = new Date()): JobId {
  const timestamp = now
    .toISOString()
    .replaceAll(/[-:.TZ]/g, "")
    .slice(0, 14)
  return `job_${timestamp}_${randomBytes(3).toString("hex")}`
}

export function createEventId(): string {
  return `evt_${randomUUID()}`
}

export function createUploadId(now = new Date()): string {
  const timestamp = now
    .toISOString()
    .replaceAll(/[-:.TZ]/g, "")
    .slice(0, 14)
  return `upl_${timestamp}_${randomBytes(3).toString("hex")}`
}
