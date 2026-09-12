---
name: report-export
owner_agent: Archivist
categories: [export]
origin: core
trigger_examples: [CSV, XLSX, Markdown SOT, community wiki, Mermaid, GraphML, Cypher, DOCX, PPTX, export manifest]
template_path: templates/report-export/
expected_writes: [.retrospec/exports/manifest.json, .retrospec/exports/]
refusal_boundary: Refuse destinations outside .retrospec/exports/ and preserve confidence/provenance labels.
requires_generation_contract: false
promoted_from: null
created_by: shipped
---

# report-export Skill

## Purpose

Create user-facing retrospec exports and report projections from retro, spec, glossary, and memory context.

## Categories

- `export`
- report generation
- Markdown SOT projection
- community/wiki projection

## Primary outputs

- `.retrospec/exports/manifest.json`
- `.retrospec/exports/*.csv`
- `.retrospec/exports/*.xlsx`
- `.retrospec/exports/call_graph.graphml`
- `.retrospec/exports/call_graph.cypher`
- `.retrospec/exports/call_graph.mmd`
- Future `.retrospec/exports/sot-md/` Markdown tree projection
- Future DOCX/PPTX report artifacts

## Capabilities

### CSV/XLSX exports

- Export structure, symbol, graph, and spec result tables through approved Archivist manifests.
- Record input DB paths, category, source fingerprint, analysis run id, format, and file metadata in the export manifest.
- Serve generated files through the dashboard/API download surface.

### Markdown SOT projection

- Keep agent-readable Markdown projection under `.retrospec/exports/sot-md/`.
- Preserve source category, entity ids, confidence labels, analysis run ids, and memory-note provenance in generated Markdown metadata.
- Treat Markdown SOT as an export projection, not as the source DB of record.

### Community wiki export

- Export community/EPIC candidates as reviewable grouping pages.
- Label all automatic groupings as candidates until human/spec confirmation exists.
- Include ambiguous-edge counts and review-needed evidence so reports do not hide uncertain graph structure.

### Mermaid and rendered reports

- Generate Mermaid source for sequence/community diagrams when it clarifies a report.
- Use `GET /graph/export?project_path=<path>&format=mermaid` for sequence candidate Mermaid source backed by `sequence_candidates`.
- Delegate render-heavy DOCX/PPTX/SVG work to Excavator through approved manifests.
- Store rendered artifacts only under `.retrospec/exports/`.

### External graph tool exports

- Use `GET /graph/export?project_path=<path>&format=graphml|cypher|mermaid` for direct graph projections from SQLite-owned call graph state.
- Write GraphML, Cypher, and Mermaid graph exports under `.retrospec/exports/` and expose them through the same dashboard/API download surface as CSV/XLSX exports.
- Preserve call confidence labels and unresolved/ambiguous evidence in generated graph metadata instead of converting candidates into confirmed facts.

## Memory and glossary contract

- Use glossary data as dictionary/reference material for table, column, and term names.
- Use active, anchor-relevant `memory_notes` as human interpretation context.
- Preserve memory provenance when memory notes affect wording, grouping, or recommendations.
- Exclude superseded or rejected memory notes unless the user requests an audit/history export.
- Do not mutate glossary or memory note DBs during export generation.

## Agent contract

- Archivist loads this skill for CSV/XLSX export, Markdown SOT projection, community wiki export, Mermaid/GraphML/Cypher source, DOCX, or PPTX requests.
- Archivist checks `/analysis/status` before export planning.
- Archivist submits long-running generation or rendering through Excavator.
- Reports must preserve `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` labels instead of flattening evidence confidence.

## Package layout

- Loader entry point: `skills/report-export/SKILL.md`.
- Export templates and manifests: `templates/report-export/`.
- Detailed static-parser references: none. This skill projects approved retro/spec/glossary/memory records into exports and delegates render-heavy work rather than generating parser code.

## Runbook

### Inputs

- Export request naming format, scope, destination surface, and requested analysis run/category.
- `/analysis/status` result for retro/spec/glossary/memory availability.
- Approved Archivist manifest and source DB paths under `.retrospec/`.

### Steps

1. Check `/analysis/status` and reject or downgrade exports whose required inputs are missing, failed, or stale.
2. Build an export manifest that records input DB paths, source fingerprints, category scope, analysis run id, requested format, and destination path.
3. Generate CSV/XLSX, Markdown SOT, community wiki, GraphML/Cypher/Mermaid source, or rendered-report artifacts only for supported requested surfaces.
4. Preserve entity ids, source categories, confidence labels, ambiguous/review-needed evidence, glossary provenance, and memory-note provenance in exported metadata or report text.
5. Delegate long-running or render-heavy DOCX/PPTX/SVG work to Excavator through the manifest instead of rendering directly.
6. Store generated artifacts under `.retrospec/exports/` and expose them through the dashboard/API download surface.
7. Record unavailable sections or renderers as named missing capabilities in the manifest notes.

### Outputs

- `.retrospec/exports/manifest.json` entries for every generated or intentionally unavailable artifact.
- Export files under `.retrospec/exports/`, including CSV/XLSX tables, GraphML/Cypher/Mermaid graph projections, Markdown SOT tree, community/wiki pages, or delegated render outputs.
- User-facing report notes that distinguish absent upstream evidence from export-format omissions.

### Failure handling

- If a requested destination is outside `.retrospec/exports/`, reject it before writing files.
- If a renderer or export surface is unavailable, write a fallback artifact only when it is clearly labeled incomplete.
- If upstream evidence has ambiguity or missing capabilities, preserve those notes rather than hiding them for presentation polish.

### Handoff boundaries

- Export generation is a projection of retro/spec/glossary/memory DBs, not the source of record.
- Archivist can plan/report, but Excavator owns long-running render execution.
- This skill must not mutate source analysis DBs, glossary DBs, or memory notes.

## Fallback

- If Markdown SOT generation is not implemented, keep the reserved `.retrospec/exports/sot-md/` path in the manifest and report the capability as unavailable.
- If render dependencies are unavailable, export Mermaid source and record the missing renderer capability.
- If a requested report path is outside `.retrospec/exports/`, reject the request.

## Coverage reporting

- Report which export surfaces were generated and which requested surfaces fell back: CSV, XLSX, GraphML, Cypher, Mermaid, Markdown SOT, community wiki, DOCX, or PPTX.
- Name missing capabilities such as `markdown-sot-generation`, `docx-renderer`, `pptx-renderer`, `community-wiki-export`, or `mermaid-renderer` in the export manifest notes.
- Preserve upstream coverage gaps from retro/spec so users can distinguish absent evidence from export omissions.
- Do not present a fallback artifact as a complete report when requested sections were unavailable.

## Manual QA

1. Ask Archivist for a Markdown SOT projection and confirm it uses `report-export`, checks `/analysis/status`, and writes only under `.retrospec/exports/sot-md/`.
2. Seed a community candidate with ambiguous edges and confirm the export labels it as a candidate with review-needed evidence.
3. Seed glossary matches and memory notes for the same anchor and confirm export wording preserves their separate roles.
4. Request DOCX/PPTX rendering and confirm render work is delegated through Excavator rather than executed directly by Archivist.
