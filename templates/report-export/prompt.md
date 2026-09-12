# report-export prompt skeleton

## Inputs

- `project_path`: absolute project root selected by Archivist.
- `format`: `csv`, `xlsx`, `graphml`, `cypher`, `mermaid`, `markdown-tree`, `community-wiki`, `docx`, or `pptx`.
- `scope`: categories, entities, communities, or analysis run ids to export.
- `status_context`: `/analysis/status` result.
- `destination`: path under `.retrospec/exports/`.

## Expected writes

- `.retrospec/exports/manifest.json`
- `.retrospec/exports/*`
- `.retrospec/exports/call_graph.graphml`, `.retrospec/exports/call_graph.cypher`, or `.retrospec/exports/call_graph.mmd` for `/graph/export`
- `.retrospec/exports/sot-md/` for Markdown SOT projection when implemented

## Planning checklist

1. Check `/analysis/status` before reading DBs or planning reports.
2. Reject destinations outside `.retrospec/exports/`.
3. Preserve entity ids, source categories, confidence labels, review-needed evidence, glossary provenance, and memory-note provenance.
4. Label incomplete fallback artifacts with named missing capabilities.
5. Prefer `GET /graph/export?format=graphml|cypher|mermaid` for direct graph projections from SQLite-owned call graph state.
6. Delegate render-heavy DOCX/PPTX/SVG work to Excavator.
