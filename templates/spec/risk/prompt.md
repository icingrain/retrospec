# risk.v1

Generate structured risk findings from Curator-confirmed Retro evidence.

- Preserve `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` evidence labels.
- Treat ambiguous evidence as review-needed, not confirmed fact.
- Write only rows compatible with `risk_findings`.
