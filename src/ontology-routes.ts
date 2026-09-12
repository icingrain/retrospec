import type { Hono } from "hono"
import { ZodError, z } from "zod"
import { searchGlossary } from "./glossary-search"
import { type OntologyInclude, exploreOntology } from "./ontology-explore"
import { projectPaths } from "./paths"
import { ensureProjectRegistry } from "./registry"

const ontologyIncludeSchema = z
  .string()
  .default("structure,semantics,evidence")
  .transform((value) => parseOntologyInclude(value))

const ontologyExploreQuerySchema = z.object({
  project_path: z.string().min(1),
  anchor: z.string().min(1),
  depth: z.coerce.number().int().min(1).max(4).default(1),
  include: ontologyIncludeSchema,
})

const glossarySearchQuerySchema = z.object({
  project_path: z.string().min(1),
  term: z.string().min(1),
})

export function registerOntologyRoutes(app: Hono): void {
  app.get("/ontology/explore", async (c) => {
    try {
      const request = ontologyExploreQuerySchema.parse({
        project_path: c.req.query("project_path"),
        anchor: c.req.query("anchor"),
        depth: c.req.query("depth"),
        include: c.req.query("include"),
      })
      const paths = projectPaths(request.project_path)
      await ensureProjectRegistry(paths)
      return c.json(exploreOntology(paths, request.anchor, request.depth, request.include))
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ error: "invalid ontology explore query" }, 400)
      }
      throw error
    }
  })

  app.get("/glossary/search", async (c) => {
    try {
      const request = glossarySearchQuerySchema.parse({
        project_path: c.req.query("project_path"),
        term: c.req.query("term"),
      })
      const paths = projectPaths(request.project_path)
      await ensureProjectRegistry(paths)
      return c.json({ matches: searchGlossary(paths, request.term) })
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ error: "invalid glossary search query" }, 400)
      }
      throw error
    }
  })
}

function parseOntologyInclude(value: string): ReadonlySet<OntologyInclude> {
  const requested = value.split(",").map((item) => item.trim())
  const allowed = new Set<OntologyInclude>(["structure", "semantics", "evidence"])
  const parsed = requested.filter(isOntologyInclude)
  return new Set(parsed.length === 0 ? allowed : parsed)
}

function isOntologyInclude(value: string): value is OntologyInclude {
  return value === "structure" || value === "semantics" || value === "evidence"
}
