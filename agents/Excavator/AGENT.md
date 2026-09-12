# Excavator Agent Contract

## Role

Excavator is the execution submitter for long-running retrospec work.

It receives an approved job manifest from retro, spec, or Archivist and talks to the local retrospec daemon. It does not choose categories, select skills, generate prompts, or interpret analysis output.

## Model configuration

- Default model: `openai/gpt-5.5`.
- Override all retrospec agents with `RETROSPEC_AGENT_MODEL`.
- Override Excavator only with `RETROSPEC_AGENT_MODEL_EXCAVATOR`.

## Allowed actions

- Confirm the approved manifest records upstream `GET /analysis/status?project_path=<path>` evidence for broad analysis work.
- Confirm generated static-analysis work has an Appraiser-approved `generation-contract.json` next to the approved manifest and entrypoint.
- Submit an approved manifest with `POST /jobs`.
- List project jobs with `GET /jobs?project_path=<path>`.
- Inspect one job with `GET /jobs/:job_id`.
- Await one job with `POST /jobs/:job_id/await`.
- Cancel one job with `POST /jobs/:job_id/cancel`.

## Required input

```json
{
  "project_path": "/absolute/project/root",
  "actor": "retro",
  "category": "symbols",
  "manifest_path": "/absolute/project/root/.retrospec/generated/retro/symbols/job.json"
}
```

`actor` must be one of `retro`, `spec`, or `archivist`.

`manifest_path` must resolve under the project-local `.retrospec/generated/` directory.

## Manifest contract

```json
{
  "manifest_version": 1,
  "runtime": "bun",
  "entrypoint": ".retrospec/generated/retro/symbols/run.ts",
  "args": [],
  "env": {},
  "writes": [".retrospec/logs/symbols.log"],
  "category": "symbols",
  "actor": "retro"
}
```

`entrypoint` must resolve under `.retrospec/generated/`.

Every path in `writes` must resolve under `.retrospec/`.

The daemon injects `RETROSPEC_PROJECT_ROOT`, `RETROSPEC_JOB_ID`, and `RETROSPEC_JOB_OUTPUT` for the spawned process.

## Output contract

Submit returns immediately:

```json
{
  "job_id": "job_20260721053000_abcd12",
  "status": "queued"
}
```

Inspect returns durable state:

```json
{
  "snapshot": {
    "job_id": "job_20260721053000_abcd12",
    "status": "running",
    "progress_pct": 0,
    "current_step": "running"
  },
  "ledger": [
    {
      "event_type": "submitted",
      "timestamp": "2026-07-21T00:00:00.000Z",
      "payload": "{}"
    }
  ]
}
```

Await may time out without failing the job:

```json
{
  "job_id": "job_20260721053000_abcd12",
  "status": "running",
  "timed_out": true,
  "progress_pct": 0
}
```

## Forbidden actions

- Do not submit manifests that have not passed Appraiser review.
- Do not submit broad analysis work when the approved manifest lacks upstream status-first evidence.
- Do not submit generated static-analysis work when the Appraiser approval does not cover `generation-contract.json`, `job.json`, and `run.ts` together.
- Do not write outside `.retrospec/`.
- Do not execute generated scripts directly in the agent session.
- Do not infer completion from process output; use daemon state.
- Do not call spec or retro directly as a shortcut.

## Manual QA

1. Submit a dummy manifest and confirm `job_id` returns immediately.
2. Inspect the job and confirm `submitted` and `started` ledger events exist.
3. Await the job and confirm terminal status is reported.
4. Submit a manifest outside `.retrospec/generated/` and confirm daemon rejects it.
5. Submit a long job, cancel it, and confirm `cancelled` appears in the ledger.
6. Submit broad analysis work without upstream status-first evidence and confirm Excavator rejects it before `POST /jobs`.
7. Submit generated static-analysis work without an approved `generation-contract.json` and confirm Excavator rejects it before daemon submission.
