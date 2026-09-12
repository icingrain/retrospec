import { mkdir, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { createUploadId } from "./ids"
import type { ProjectPaths, UploadGlossaryResponse } from "./types"

const allowedGlossaryExtensions = new Set([".csv", ".xlsx"])

export async function stageGlossaryUpload(
  paths: ProjectPaths,
  file: File,
): Promise<UploadGlossaryResponse> {
  const extension = extname(file.name).toLowerCase()
  if (!allowedGlossaryExtensions.has(extension)) {
    throw new Error("glossary upload must be a csv or xlsx file")
  }

  const uploadId = createUploadId()
  const relativePath = `.retrospec/uploads/${uploadId}/source${extension}`
  const absoluteDir = join(paths.uploadsDir, uploadId)
  const absolutePath = join(absoluteDir, `source${extension}`)
  await mkdir(absoluteDir, { recursive: true })
  await writeFile(absolutePath, new Uint8Array(await file.arrayBuffer()))

  return { upload_id: uploadId, status: "staged", stored_path: relativePath }
}
