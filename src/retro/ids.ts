import { createHash } from "node:crypto"

export function createEntityId(...parts: readonly string[]): string {
  const hash = createHash("sha256").update(parts.join("\0")).digest("hex")
  return `ent_${hash.slice(0, 24)}`
}

export function createSourceFingerprint(paths: readonly string[]): string {
  return createHash("sha256").update(paths.join("\n")).digest("hex")
}
