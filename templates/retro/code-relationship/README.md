# code-relationship Generated Job Template

Use this template when retro generates relationship evidence for call graph, dependency, data flow, impact radius, usage metrics, or community candidates.

- The daemon job must run after `structure` and `symbols` are ready for analysis.
- Appraiser must review the manifest before Excavator submits it.
- Store relationship outputs under `.retrospec/retro/` and preserve confidence labels.
- Treat communities as candidates, not confirmed business EPICs.
