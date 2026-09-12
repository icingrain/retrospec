import { lstatSync } from "node:fs"
import { lstat } from "node:fs/promises"
import { join } from "node:path"
import type { ProjectPaths } from "./types"

export async function assertProjectStatePathSafe(paths: ProjectPaths): Promise<void> {
  await assertNoSymlink(paths.stateDir)
  await assertNoSymlink(join(paths.stateDir, "retro"))
}

export function assertProjectStatePathSafeSync(
  paths: ProjectPaths,
  extraPaths: readonly string[] = [],
): void {
  assertNoSymlinkSync(paths.stateDir)
  assertNoSymlinkSync(join(paths.stateDir, "retro"))
  for (const path of extraPaths) {
    assertNoSymlinkSync(path)
  }
}

async function assertNoSymlink(path: string): Promise<void> {
  const status = await existingPathStatus(path)
  if (status?.isSymbolicLink()) {
    throw new Error(`refusing to write through symlink: ${path}`)
  }
}

async function existingPathStatus(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }
    throw error
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function assertNoSymlinkSync(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error(`refusing to write through symlink: ${path}`)
    }
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error
    }
  }
}
