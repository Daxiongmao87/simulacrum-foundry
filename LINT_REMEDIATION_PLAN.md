# ESLint Remediation Plan

> **Problem:** Git push is blocked by the Husky pre-push hook due to **201 ESLint errors** and **24 warnings**.
> 
> **Goal:** Systematically resolve all lint errors to enable clean git pushes while maintaining code quality and avoiding regressions.

---

## Phase 1: Quick Wins (Low-Risk, High-Impact)

**Objective:** Eliminate ~40% of errors with minimal code changes that don't affect logic.

### 1.1 Unused Variables & Imports
Rename unused parameters/variables to use `_` prefix or remove dead imports.

| File | Line | Variable | Fix |
|------|------|----------|-----|
| `scripts/tools/document-create.js` | 7 | `SimulacrumError` | Remove import |
| `scripts/tools/document-delete.js` | 6 | `SimulacrumError` | Remove import |
| `scripts/tools/document-schema.js` | 7 | `detectDocumentReferences` | Remove import |
| `scripts/simulacrum.js` | 11 | `SimulacrumSidebarTab` | Remove dead import |
| `scripts/macros.js` | 6 | `SimulacrumCore` | Remove dead import |
| `scripts/utils/dev.js` | 6 | `_readUrlToggle` | Remove or use |
| `scripts/ui/sidebar-state-syncer.js` | 19 | `options` | Rename to `_options` |
| `scripts/ui/settings-interface.js` | 536 | `data` | Rename to `_data` |
| `scripts/ui/simulacrum-sidebar-tab.js` | 14 | `initializeChatHandler` | Remove import |
| `scripts/ui/simulacrum-sidebar-tab.js` | 618 | `content` | Rename to `_content` |
| `scripts/ui/simulacrum-sidebar-tab.js` | 629 | `error` | Rename to `_error` |
| `scripts/ui/simulacrum-sidebar-tab.js` | 693-703 | `event`, `target` | Rename to `_event`, `_target` |

### 1.2 Undefined Globals
Add missing globals to `.eslintrc.cjs` or import them properly.

| File | Line | Symbol | Fix |
|------|------|--------|-----|
| `scripts/simulacrum.js` | 145 | `loadTemplates` | Add to globals |
| `scripts/ui/simulacrum-sidebar-tab.js` | 215 | `renderTemplate` | Add to globals |
| `scripts/macros.js` | 78 | `Folder` | Add to globals |
| `scripts/macros.js` | 81 | `Macro` | Add to globals |
| `scripts/tools/execute-macro.js` | 55 | `fromUuid` | Add to globals |

### 1.3 Empty Catch Blocks
Add `// intentionally empty` comments or minimal logging to empty catch blocks.

**Files affected:**
- `scripts/utils/ai-normalization.js` (6 instances: lines 208, 231, 268, 284, 296, 310)
- `scripts/utils/dev.js` (4 instances: lines 26, 29, 40, 53)
- `scripts/utils/logger.js` (1 instance: line 34)

### 1.4 Useless Escape Characters
Remove unnecessary backslashes from strings/regex.

| File | Line | Fix |
|------|------|-----|
| `scripts/utils/ai-normalization.js` | 238 | Remove `\}` → `}` |
| `scripts/ui/simulacrum-sidebar-tab.js` | 1002 | Remove `\"` → `"` |

### 1.5 Duplicate Object Keys
Fix the duplicate key error.

| File | Line | Fix |
|------|------|-----|
| `scripts/ui/simulacrum-sidebar-tab.js` | 529 | Remove or rename duplicate `processLabel` |

---

## Phase 2: Line Length & Formatting (Medium-Risk)

**Objective:** Break long lines while preserving readability.

### 2.1 Long Lines (>100 chars)

**Strategy:** Use line breaks at logical points (after commas, before operators). Apply consistently.

| File | Lines Affected |
|------|----------------|
| `scripts/ui/simulacrum-sidebar-tab.js` | 18, 19, 216, 293, 530 |
| `scripts/utils/ai-normalization.js` | 126, 163, 205 |
| `scripts/tools/document-update.js` | 174, 178, 181, 296, 303, 320, 338, 371, 379, 419, 438 |
| `scripts/core/tool-loop-handler.js` | 267, 378, 380, 405 |
| `scripts/lib/markdown-renderer.js` | 5 |
| `scripts/utils/schema-validator.js` | 81 |

---

## Phase 3: Function Decomposition (Higher-Risk, Requires Testing)

**Objective:** Break down large/complex functions into smaller, focused helpers.

### 3.1 Complexity Violations (cyclomatic complexity > 10)

**Strategy:** Extract conditional branches into helper functions. Use early returns to reduce nesting.

| File | Function | Complexity | Strategy |
|------|----------|------------|----------|
| `scripts/utils/ai-normalization.js` | `normalizeAIResponse` | **59** | Major refactor - extract provider-specific normalizers |
| `scripts/utils/ai-normalization.js` | `parseInlineToolCall` | 27 | Extract JSON parsing logic |
| `scripts/tools/document-update.js` | `#prepareEmbeddedOperation` | 30 | Split by operation type |
| `scripts/tools/document-update.js` | `#normalizeOperation` | 23 | Use lookup table |
| `scripts/core/tool-loop-handler.js` | `getNextAIResponse` | 17 | Extract validation/error handling |
| `scripts/utils/schema-validator.js` | `analyzeField` | 17 | Extract type-specific analyzers |
| `scripts/tools/document-update.js` | `#performArrayOperation` | 16 | Split add/remove/replace |
| `scripts/core/tool-verification.js` | `performPostToolVerification` | 16 | Extract per-tool verifiers |
| `scripts/ui/settings-interface.js` | `_testApiConnection` | 15 | Extract per-provider testers |
| `scripts/core/tool-loop-handler.js` | `executeToolCalls` | 14 | Extract result handling |
| `scripts/utils/permissions.js` | `canListDocuments` | 13 | Use permission map |
| `scripts/ui/simulacrum-sidebar-tab.js` | `_prepareContext` | 13 | Extract data preparation |
| `scripts/core/tool-registry.js` | Arrow function (230) | 12 | Extract to named function |
| `scripts/lib/markdown-renderer.js` | `render` | 12 | Extract parsing steps |
| `scripts/tools/document-update.js` | Multiple methods | 11-12 | Incremental extraction |
| All others | Various | 11 | Minor extraction |

### 3.2 Long Functions (>50 lines)

**Strategy:** Extract logical blocks. Ensure single responsibility.

| File | Function | Lines | Strategy |
|------|----------|-------|----------|
| `scripts/utils/ai-normalization.js` | `normalizeAIResponse` | 164 | Split by AI provider |
| `scripts/utils/ai-normalization.js` | `parseInlineToolCall` | 84 | Extract parse strategies |
| `scripts/simulacrum.js` | `registerAPISettings` | 84 | Group related settings |
| `scripts/ui/simulacrum-sidebar-tab.js` | `_onSendMessage` | 74 | Extract message processing |
| `scripts/tools/document-update.js` | `execute` | 70 | Extract validation/execution |
| `scripts/tools/document-update.js` | `#prepareEmbeddedOperation` | 84 | Split by embed type |
| `scripts/core/tool-loop-handler.js` | `executeToolCalls` | 69 | Extract iteration logic |
| `scripts/ui/settings-interface.js` | `registerAdvancedSettings` | 67 | Group by setting category |
| `scripts/tools/document-read.js` | `execute` | 60 | Extract formatters |
| `scripts/utils/schema-validator.js` | `analyzeField` | 60 | Extract type handlers |
| `scripts/tools/document-update.js` | `#extractEmbeddedFieldUpdates` | 56 | Extract field processors |
| `scripts/tools/artifact-search.js` | `execute` | 56 | Extract search logic |
| `scripts/tools/document-update.js` | `#buildOperationPlan` | 54 | Extract planning steps |
| `scripts/ui/simulacrum-sidebar-tab.js` | `_attachPartListeners` | 51 | Extract listener groups |

### 3.3 Too Many Parameters (>4)

**Strategy:** Use options objects instead of positional parameters.

| File | Function | Params | Fix |
|------|----------|--------|-----|
| `scripts/core/tool-loop-handler.js` | `getNextAIResponse` | 7 | Use `{messages, tools, ...}` object |
| `scripts/core/tool-loop-handler.js` | `executeToolCalls` | 5 | Use options object |
| `scripts/ui/settings-interface.js` | `convertSettingToTextarea` | 5 | Use config object |

### 3.4 Max Nesting Depth (>4 levels)

| File | Line | Fix |
|------|------|-----|
| `scripts/tools/execute-macro.js` | 65 | Extract inner logic to helper |

---

## Phase 4: File-Level Refactoring (Highest-Risk, Requires Architecture Review)

**Objective:** Split oversized files to improve maintainability.

### 4.1 Files Exceeding 500 Lines

| File | Current Lines | Strategy |
|------|---------------|----------|
| `scripts/ui/simulacrum-sidebar-tab.js` | 650 | Extract into: `sidebar-renderer.js`, `sidebar-handlers.js` |
| `scripts/tools/document-update.js` | 547 | Extract into: `update-operations.js`, `embedded-operations.js` |

---

## Execution Strategy

### Iteration Order

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Quick Wins                                        │
│  ├─ Run: npm run lint (get baseline)                        │
│  ├─ Fix unused vars, add globals, fix empty blocks          │
│  ├─ Run: npm test (verify no regressions)                   │
│  ├─ Run: npm run lint (verify reduction)                    │
│  └─ Commit: "fix(lint): resolve quick-win lint errors"      │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: Line Length                                       │
│  ├─ Break long lines systematically                         │
│  ├─ Run: npm test                                           │
│  ├─ Run: npm run lint                                       │
│  └─ Commit: "style(lint): fix line length violations"       │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: Function Decomposition                            │
│  ├─ Start with highest-complexity functions                 │
│  ├─ Extract helpers, test after each function               │
│  ├─ Run: npm test after EACH decomposition                  │
│  └─ Commit per file: "refactor(X): reduce complexity"       │
├─────────────────────────────────────────────────────────────┤
│  Phase 4: File Splitting                                    │
│  ├─ Only if test coverage is good                           │
│  ├─ Split incrementally, test after each split              │
│  └─ Commit per file: "refactor(X): split oversized file"    │
└─────────────────────────────────────────────────────────────┘
```

### Per-Phase Checklist

For **each phase**:
1. [ ] Run `npm run lint` to get current error count
2. [ ] Make targeted fixes
3. [ ] Run `npm test` to verify no regressions
4. [ ] Run `npm run lint` to verify error reduction
5. [ ] Commit with descriptive message
6. [ ] Repeat until phase complete

### Verification Plan

**Automated Testing:**
```bash
# Run full test suite after each phase
npm test

# Run linter to verify progress
npm run lint

# Final verification before push
npm run lint && npm test && git push
```

**Manual Testing:**
- After Phase 3-4 changes, deploy to Foundry and verify:
  1. Sidebar tab loads correctly
  2. Chat functionality works
  3. Tool execution succeeds
  4. Settings interface opens and saves

---

## Progress Tracking

### Error Count by Phase

| Phase | Starting Errors | Expected After | Actual After |
|-------|-----------------|----------------|--------------|
| Baseline | 201 | - | - |
| Phase 1 | 201 | ~160 | [ ] |
| Phase 2 | ~160 | ~140 | [ ] |
| Phase 3 | ~140 | ~20 | [ ] |
| Phase 4 | ~20 | 0 | [ ] |

---

## Risk Mitigation

1. **Commit frequently** - Small, atomic commits make rollback easy
2. **Test after every change** - Never let tests go red
3. **Phase 3-4 are highest risk** - Function decomposition can introduce bugs
4. **Review diffs carefully** - Ensure logic preservation during refactoring
5. **Keep backups** - Create a branch before major refactoring: `git checkout -b lint-fixes`

---

## Files by Priority

### Critical Path (must fix to push)
1. `scripts/utils/ai-normalization.js` - Most complex, most errors
2. `scripts/ui/simulacrum-sidebar-tab.js` - Largest file, many errors
3. `scripts/tools/document-update.js` - High complexity, many errors
4. `scripts/core/tool-loop-handler.js` - Core functionality, multiple issues

### Secondary Priority
5. `scripts/ui/settings-interface.js`
6. `scripts/utils/schema-validator.js`
7. `scripts/utils/dev.js`
8. `scripts/utils/permissions.js`

### Quick Fixes
9. `scripts/tools/document-create.js`
10. `scripts/tools/document-delete.js`
11. `scripts/tools/document-schema.js`
12. `scripts/macros.js`
13. `scripts/simulacrum.js`
14. All remaining files
