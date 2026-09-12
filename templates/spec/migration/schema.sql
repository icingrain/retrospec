select analysis_run_id, group_id, title, priority, evidence_label
from migration_groups;

select analysis_run_id, finding_id, group_id, migration_type, priority, evidence_label
from migration_findings;
