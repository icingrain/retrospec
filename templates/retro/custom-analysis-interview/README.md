# custom-analysis-interview Generated Job Template

Use this template when no built-in retro static-analysis skill fits but the request is still source-backed extraction work.

- The interview defines target, conditions, impossible cases, output shape, and completion criteria.
- Surveyor must confirm at least one source sample before generation.
- The generated program follows the same Appraiser and Excavator gates as built-in static-analysis skills.
- This route creates run-local generated artifacts only; no auto-promotion to a reusable custom skill package.
- Reusable skill proposals go to `skill-promotion-candidates.jsonl` with `approval_required:true` and `auto_write_skills:false`; they never write directly into `skills/`.
