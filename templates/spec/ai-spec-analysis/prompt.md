# ai-spec-analysis prompt skeleton

## Inputs

- `project_path`: absolute project root selected by spec.
- `analysis_run_id`: stable id for this analysis run.
- `ready_handoffs`: Curator-confirmed retro categories.
- `evidence_context`: registry entities, graph communities, SQL, quality/risk candidates, glossary matches, and active memory notes.
- `prompt_version`: deterministic prompt/run contract version.

## Expected writes

- `.retrospec/spec/ai_analysis.db` `analysis_runs`
- `.retrospec/spec/ai_analysis.db` `risk_findings`

## Planning checklist

1. Check `/analysis/status` before batch construction.
2. Preserve `AMBIGUOUS` evidence as review-needed context.
3. Label `INFERRED` relationship support explicitly.
4. Keep glossary dictionary context separate from memory-note human context.
5. Use community/EPIC candidate grouping only when Curator supplies graph community context.
