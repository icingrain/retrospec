import { createHash, randomUUID } from "node:crypto"

export function createSpecAnalysisRunId(now: string): string {
  return `arun_${now.replaceAll(/[-:.TZ]/g, "").slice(0, 17)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`
}

export function createRiskFindingId(entityId: string, riskType: string): string {
  const hash = createHash("sha256").update(`${entityId}\0${riskType}`).digest("hex")
  return `find_${hash.slice(0, 24)}`
}
