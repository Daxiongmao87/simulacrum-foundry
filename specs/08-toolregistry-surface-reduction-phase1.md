Title: ToolRegistry surface reduction (Phase 1, non-breaking)

Overview
- ToolRegistry exposes categories, dependencies, hooks, stats, queues, etc., most unused. Phase 1 trims truly unused internals and stabilizes a minimal public API without breaking callers.

Affected
- scripts/core/tool-registry.js

Investigate
- Map actual usages: registerTool, getTool, getToolInfo, getToolSchemas, executeTool.
- rg for dependencies, hooks, stats usage across codebase.

Fix
- Remove internal execution queue and registry-specific hooks if unreferenced.
- Add doc comment marking minimal public API; leave other features for Phase 2 deprecation.

Verify
- Tools still register and execute.
- getToolSchemas output unchanged.
- rg shows removed internals are not referenced.

