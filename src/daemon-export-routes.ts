import { basename } from "node:path"
import type { Hono } from "hono"
import { z } from "zod"
import {
  findExportFilePath,
  generateRetroExports,
  listExportFiles,
  regenerateRetroExports,
} from "./exports"
import { GRAPH_EXPORT_FORMATS, generateGraphExport } from "./graph-export"
import { projectPaths } from "./paths"
import { ensureProjectRegistry, listProjects, registerProject } from "./registry"
import type { RuntimePaths } from "./types"

const exportProjectRequestSchema = z.object({
  project_path: z.string().min(1),
})

const generateExportsRequestSchema = z.object({
  project_path: z.string().min(1),
  format: z.union([z.literal("csv"), z.literal("xlsx")]),
})

const graphExportQuerySchema = z.object({
  project_path: z.string().min(1),
  format: z.enum(GRAPH_EXPORT_FORMATS),
})

export function registerExportRoutes(app: Hono, runtime: RuntimePaths): void {
  app.get("/exports", async (c) => {
    const request = exportProjectRequestSchema.parse({ project_path: c.req.query("project_path") })
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    return c.json({ exports: await listExportFiles(paths) })
  })

  app.post("/exports/regenerate", async (c) => {
    const request = exportProjectRequestSchema.parse(await c.req.json())
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    return c.json({ exports: await regenerateRetroExports(paths) })
  })

  app.post("/exports/generate", async (c) => {
    const request = generateExportsRequestSchema.parse(await c.req.json())
    const paths = projectPaths(request.project_path)
    await ensureProjectRegistry(paths)
    registerProject(runtime, paths.projectRoot)
    return c.json({ exports: await generateRetroExports(paths, { format: request.format }) })
  })

  app.get("/graph/export", async (c) => {
    const parsed = graphExportQuerySchema.safeParse({
      project_path: c.req.query("project_path"),
      format: c.req.query("format"),
    })
    if (!parsed.success) {
      return c.json({ error: "invalid graph export query" }, 400)
    }
    const paths = projectPaths(parsed.data.project_path)
    await ensureProjectRegistry(paths)
    registerProject(runtime, paths.projectRoot)
    return c.json({ export_file: await generateGraphExport(paths, parsed.data.format) })
  })

  app.get("/exports/:file_id/download", async (c) => {
    const fileId = c.req.param("file_id")
    const filePath = await findRegisteredExportFilePath(runtime, fileId)
    if (filePath === null) {
      return c.json({ error: "export file not found" }, 404)
    }
    return new Response(Bun.file(filePath), {
      headers: { "Content-Disposition": `attachment; filename="${basename(filePath)}"` },
    })
  })
}

async function findRegisteredExportFilePath(
  runtime: RuntimePaths,
  fileId: string,
): Promise<string | null> {
  for (const project of listProjects(runtime)) {
    const filePath = await findExportFilePath(projectPaths(project.project_path), fileId)
    if (filePath !== null) {
      return filePath
    }
  }
  return null
}
