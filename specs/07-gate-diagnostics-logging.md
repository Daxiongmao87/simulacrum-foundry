Title: Gate diagnostics logging behind isDiagnosticsEnabled

Overview
- Console logging is verbose in core, tool loop, and sidebar. Route non-error logs through createLogger and guard them via isDiagnosticsEnabled to reduce noise.

Affected
- scripts/core/simulacrum-core.js
- scripts/core/tool-loop-handler.js
- scripts/ui/simulacrum-sidebar-tab.js

Investigate
- Enumerate console.* calls and decide which become logger.debug/info.
- Confirm createLogger and isDiagnosticsEnabled availability in each file.

Fix
- Replace console.log/warn where appropriate with logger.debug/info; keep logger.error for real errors.
- Wrap verbose logs within if (isDiagnosticsEnabled()) blocks.

Verify
- With diagnostics off: minimal logs.
- With diagnostics on: prior insights appear.
- Tests still pass (some tests may assert logger calls; adjust if necessary).

