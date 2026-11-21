# Design, read-only

Inspect the pinned repository and the request. Return the design schema with a narrow path allowlist, concrete acceptance criteria with unique IDs, and relevant existing repo-relative work/test_*.js files. Explicit file paths are preferred. If a directory is needed use path/**.

Set needs_user_decision.required for changes to buying formulas, GO, access policy, costs, credentials, permissions, recurring operations or when scope cannot be settled. Describe why without designing an implementation for that case. Data changes default to false. Changes to CI, deployment, the pipeline itself, package metadata and agent instructions are outside this lane.
