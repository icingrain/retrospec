# report-export Template Skeleton

Use these skeletons when Archivist plans exports, report projections, or render delegation.

- Export artifacts must be written only under `.retrospec/exports/`.
- `.retrospec/exports/manifest.json` is the source of export provenance.
- GraphML/Cypher/Mermaid graph projections are served by `GET /graph/export?project_path=<path>&format=graphml|cypher|mermaid` and still write only under `.retrospec/exports/`.
- DOCX/PPTX/SVG rendering is delegated to Excavator through an approved manifest.
- Glossary imports use `glossary-context`; exports use `report-export`.
- This template directory is the package's execution surface; the skill has no parser reference pack because it projects approved records into exports.
