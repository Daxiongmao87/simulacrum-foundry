Title: Phase 4 — Drift Removal and Compatibility Guarantees

Overview
- Remove now-redundant branches after Engine integration; guarantee compatibility for all external surfaces. Supports the module’s goal by simplifying the loop while preserving user experience and APIs.

Requirements
- R1: Delete divergent correction paths; use shared routine exclusively.
- R2: All normalization/parsing uses the single utility.
- R3: Public surfaces unchanged: settings, UI callbacks, registry APIs, persistence.
- R4: Diagnostics remain gated and informative.

Scope & Constraints
- Do not change module IDs, settings keys, or persistence formats.
- Avoid renaming public classes or functions consumed by tests/UI.

Acceptance
- A1: All existing tests pass without modification.
- A2: New consolidation tests pass (correction parity; mode parity; retry behavior).
- A3: No duplicate assistant messages; no double-binding; processStatus hooks fire as before.

Verification
- Golden run logs and UI snapshots match pre-consolidation behavior for representative flows.
- Fagan inspection confirms no drift in outbound messages across modes.

Test Coverage Mapping
- R1/R2 → unit tests confirm no callers bypass the shared routines.
- R3/R4 → integration tests and diagnostics toggles validated.

