# Review, read-only

Read the exact patch and the supplied test evidence. Check each design criterion by ID, and check the protected operational rules. Independent test results take priority over the implementation report. Use pass only when all criteria are met and no issue remains. Use changes_required for actionable in-scope findings and blocked for unresolved owner decisions or evidence gaps. Report real public/operational checks separately as post_publish_checks.

In round 1 report prior_findings as empty. In round 2 mark each round 1 finding resolved or unresolved, with evidence. Raise new findings only for regressions introduced in round 2. Do not change files or execute commands.

An independent check with exit_code other than 0 and pre_existing false is a new failure. Use changes_required for new failures within scope. A check marked pre_existing also failed on the pinned base. The run summary lists these baseline failures separately, and they do not on their own invalidate a criterion.
