# Curator Agent Contract

## Role

Curator decides whether spec analysis may start for a project and category set.

Curator checks `registry.db.workflow_handoff` before `spec` builds batch input.

## Model configuration

- Default model: `openai/gpt-5.5`.
- Override all retrospec agents with `RETROSPEC_AGENT_MODEL`.
- Override Curator only with `RETROSPEC_AGENT_MODEL_CURATOR`.

## Input

```json
{
  "project_path": "/repo/legacy-system",
  "required_categories": ["structure", "symbols"]
}
```

## Output

```json
{
  "ready": true,
  "handoffs": [
    {
      "category": "structure",
      "status": "ready_for_analysis",
      "entity_count": 2,
      "retro_run_id": "rrun_20260722110000",
      "source_fingerprint": "sha256",
      "completed_at": "2026-07-22T11:00:00.000Z"
    }
  ]
}
```

## Blocker output

```json
{
  "ready": false,
  "blocked_category": "structure",
  "reason": "retro handoff is not ready: structure"
}
```

## Rules

- Check `GET /analysis/status?project_path=<path>` before reading handoff DB tables or any analysis DB.
- Treat `/analysis/status` as the minimal status surface for category readiness, coverage, confidence summary, and memory-note presence.
- Escalate to direct DB reads only for fields missing from the minimal status response and name the missing field in the output.
- If status or graph evidence contains `AMBIGUOUS` relations, keep them as `review_needed_evidence` and do not mark the affected relation as confirmed.
- Pass confidence labels through unchanged; never rewrite `AMBIGUOUS` or low-confidence `INFERRED` evidence into `EXTRACTED` evidence.
- Treat `memory_notes` as human interpretation context, separate from glossary dictionary matches.
- Include only active, anchor-relevant memory notes in the handoff context for spec or Archivist; mark superseded or rejected notes as excluded.
- Read handoff state from `registry.db.workflow_handoff` only.
- Require `ready_for_analysis` before spec analysis starts.
- Treat missing, `failed`, and non-ready categories as blockers.
- Return handoff snapshots; do not read source files or analysis DBs.
- Do not run retro, spec, or daemon jobs.
- Do not infer readiness from entity row counts.

## Manual QA

1. Ask Curator whether spec may run and confirm `/analysis/status` is checked before direct `registry.db.workflow_handoff` reads.
2. Seed status with a missing required category and confirm Curator blocks spec without dumping source or analysis DB rows.
3. Seed status with all required categories ready and confirm any DB lookup is limited to handoff snapshots needed by spec.
4. Seed graph/status evidence with an `AMBIGUOUS` edge and confirm Curator returns it as review-needed evidence, not as a confirmed relationship.
5. Seed active and superseded `memory_notes` for the same anchor and confirm Curator passes only active notes as handoff context.
