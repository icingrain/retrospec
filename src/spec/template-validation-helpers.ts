import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import type { z } from "zod"
import { SpecTemplateValidationError } from "./template-validation-error"

export async function parseJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
  blockers: string[],
  label: string,
): Promise<T | null> {
  try {
    return schema.parse(JSON.parse(await readFile(filePath, "utf8")))
  } catch (error) {
    if (error instanceof Error) {
      blockers.push(`invalid_${label}`)
      return null
    }
    throw error
  }
}

export function resolveProjectPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(projectRoot, path)
}

export function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

export function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

export function assertNever(value: never): never {
  throw new SpecTemplateValidationError("unknown", [`unhandled_spec_template_decision:${value}`])
}
