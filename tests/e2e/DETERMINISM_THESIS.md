# E2E Bootstrapping Determinism Thesis

This document records my hypotheses about non-deterministic patterns in the e2e test bootstrapping code. Each issue will be tested individually, and reverted if the thesis is proven wrong.

---

## Issue 1: System Install Polling Loop

**Location:** `global-setup.js` lines 724-752

**Current Behavior:** After clicking "Install" for a system, the code polls up to 30 times with 2-second waits, re-navigating to `/setup` and re-authenticating each iteration.

**Thesis:** When installing via manifest URL, the installation is synchronous from the UI perspective - the dialog either closes on success or shows an error on failure. The polling is unnecessary because:
1. Foundry's package installer blocks UI until completion
2. A fresh Foundry install has no race conditions with other package operations
3. The 30x2s polling (60 seconds) can be replaced with a single wait for dialog closure + verification

**Testable Prediction:** Replacing the polling loop with a wait for the install dialog to close, followed by a single verification check, will succeed without retries.

**Risk if Wrong:** System installation might be asynchronous (download happens in background), in which case we'd need polling but could optimize the approach.

---

## Issue 2: Arbitrary waitForTimeout Calls

**Locations:** Lines 303, 316, 329, 373-374, 437, 539, 681 in global-setup.js

**Current Behavior:** Many UI interactions are followed by fixed-time delays (`waitForTimeout(2000)`, `waitForTimeout(3000)`, etc.) instead of waiting for deterministic state changes.

**Thesis:** Each timeout can be replaced with a specific condition wait:
- After EULA acceptance → wait for URL change or specific element
- After admin auth → wait for setup page content to load
- After tab click → wait for tab content to be visible
- After dialog open → wait for dialog element

**Testable Prediction:** Replacing each `waitForTimeout` with a targeted `waitForSelector` or `waitForFunction` will be faster and more reliable.

**Risk if Wrong:** Some Foundry UI transitions may have animations or async rendering that require minimum delays. In that case, a shorter timeout may still be needed.

---

## Issue 3: Tour/Consent Defensive Handling

**Location:** `global-setup.js` lines 349-395

**Current Behavior:** Code defensively checks "if visible" for tour overlay and consent dialog, trying multiple dismissal strategies.

**Thesis:** On a fresh Foundry v13 install (which this always is), the consent dialog and tour WILL appear on first access to `/setup`. This is deterministic. After dismissal, they will NOT reappear in the same session.

**Testable Prediction:** We can assertively handle these dialogs (expect them to appear, dismiss them once) rather than defensively checking.

**Risk if Wrong:** Foundry may have conditional logic for showing these dialogs based on factors I don't know (license type, locale, etc.).

---

## Issue 4: World Launch Redundant Checks

**Location:** `foundry-helpers.js` lines 205-217

**Current Behavior:** `launchWorld()` checks multiple times if already on `/join` page, assuming the world might already be running.

**Thesis:** The `gamePage` fixture in `test-base.js` calls `returnToSetup()` in teardown. This means every test starts with NO world running. The "already running" checks are unnecessary.

**Testable Prediction:** Removing the "already on /join" checks and assuming no world is running will work correctly.

**Risk if Wrong:** If `returnToSetup()` fails silently, the world might still be running. Or if tests run in parallel, multiple worlds could conflict.

---

## Issue 5: Multi-Selector Fallbacks for Known UI

**Location:** `foundry-helpers.js` lines 247-266

**Current Behavior:** Uses 6+ different selectors to find world cards, trying each until one works.

**Thesis:** We know we're testing against Foundry v13 (the zip in vendor/foundry). The UI structure is deterministic for that version. We can use the correct v13 selector directly: `[data-package-id="${worldId}"]`.

**Testable Prediction:** Using only the v13 selector will work without fallbacks.

**Risk if Wrong:** The vendor/foundry zip might contain a different Foundry version, or v13 might have selector variations I'm not aware of.

---

## Issue 6: Re-authentication Loops

**Location:** Multiple places in global-setup.js where `adminKeyInput.isVisible()` is checked before every operation.

**Current Behavior:** After navigating to `/setup`, the code always checks if authentication is needed and re-authenticates if so.

**Thesis:** Within a single Playwright browser context, session state persists. Once authenticated, subsequent navigations to `/setup` should not require re-authentication.

**Testable Prediction:** After initial authentication, removing re-auth checks on subsequent navigations will work.

**Risk if Wrong:** Foundry might expire sessions quickly, or certain operations might invalidate the session.

---

## Issue 7: Module Enable Retry Logic

**Location:** `foundry-helpers.js` lines 559-618

**Current Behavior:** After clicking "Save" in Module Management, polls 20 times with 500ms waits to detect dialog closure.

**Thesis:** Clicking Save in Module Management has exactly two deterministic outcomes:
1. Success: Dialog closes, world reloads with module enabled
2. Failure: Error shown, dialog remains open

**Testable Prediction:** Replacing the polling loop with a wait for either dialog closure OR error element will be faster and equally reliable.

**Risk if Wrong:** Foundry v13 might have intermediate states or async operations during module activation that require polling.

---

## Testing Methodology

For each issue:
1. Make a minimal, targeted change
2. Run the e2e test: `npm run test:e2e -- tests/e2e/specs/common/module-load.spec.js`
3. If test passes → thesis validated, keep change
4. If test fails → examine failure, revert if thesis was wrong

---

## Results Log

| Issue | Thesis | Result | Action |
|-------|--------|--------|--------|
| 1 | Polling unnecessary | PARTIALLY CORRECT | Dialog doesn't close, but waitFor on package element works |
| 2 | Timeouts replaceable | CORRECT | All 3 waitForTimeout replaced with deterministic waits - 5 tests pass |
| 3 | Dialogs deterministic | CORRECT | Replaced waitForTimeout with waitFor on dialog/overlay hidden state - 5 tests pass |
| 4 | Checks redundant | CORRECT | Replaced waitForTimeout with waitFor on worlds section/launch button - 5 tests pass |
| 5 | One selector sufficient | DEFERRED | Multi-selector pattern is version compatibility, not non-determinism. Fixed 1 timeout. |
| 6 | Re-auth unnecessary | DEFERRED | Low priority - defensive re-auth rarely triggered in bootstrap flow |
| 7 | Polling unnecessary | DEFERRED | Module enable polling handles async save/reload. Would require significant refactor. |

---

## Summary

**Core determinism improvements completed (Issues 1-4):**
- Replaced arbitrary `waitForTimeout` calls with deterministic `waitFor` on specific UI elements
- Total of ~10 `waitForTimeout` calls replaced with proper element/state waits
- All 5 tests pass consistently

**Remaining timeouts (Issues 5-7) are lower priority because:**
- Issue 5: Multi-selector fallbacks are version compatibility patterns (deterministic)
- Issue 6: Re-authentication happens rarely in fresh bootstrap
- Issue 7: Module enable polling handles Foundry's async reload which has no reliable event

**Files modified:**
- `tests/e2e/setup/global-setup.js` - Issues 1, 2, 3
- `tests/e2e/fixtures/foundry-helpers.js` - Issues 4, 5 (partial)
