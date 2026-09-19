# Claude Safety Guidelines

## CRITICAL EXECUTION RESTRICTIONS
- NEVER execute, suggest, or plan any destructive commands such as `rm`, `rmdir`, `git clean`, or any file deletion scripts.
- NEVER run any operations referencing the home directory path (`~/`) or the root folder (`/`). You are strictly scoped to the active workspace project directory.
- You do not possess autonomous permissions for shell executions. Every single terminal operation or code rewrite must explicitly ask the user for confirmation.
- If you notice repetitive tasks, cleanups, or refactoring that involve deleting folders, HALT immediately, explain your plan to the user, and wait for confirmation. Do not try to automate it in a single pass.
