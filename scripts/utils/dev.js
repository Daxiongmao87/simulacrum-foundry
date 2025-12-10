/**
 * Developer diagnostics helpers (console-only)
 * No game settings used; toggled via globals or URL param.
 */

function _readUrlToggle() {
  try {
    const search = globalThis.location?.search || '';
    if (!search) return false;
    const params = new URLSearchParams(search);
    return params.get('simulacrumDev') === '1';
  } catch {
    return false;
  }
}

/**
 * Returns whether diagnostics are enabled.
 * - window.SIMULACRUM_DEV === true
 * - CONFIG.debug.simulacrum === true
 * - URL contains ?simulacrumDev=1
 */
export function isDebugEnabled() {
  try {
    if (globalThis.window && globalThis.window.SIMULACRUM_DEV === true) return true;
  } catch { }
  try {
    if (globalThis.CONFIG?.debug?.simulacrum === true) return true;
  } catch { }
  // Default to true during development unless explicitly disabled.
  // URL overrides: simulacrumDev=1 enables, simulacrumDev=0 disables
  try {
    const search = globalThis.location?.search || '';
    if (search) {
      const params = new URLSearchParams(search);
      const q = params.get('simulacrumDev');
      if (q === '0') return false;
      if (q === '1') return true;
    }
  } catch { }
  return true;
}

// Optional helpers for quick toggling via console
try {
  if (typeof globalThis.window !== 'undefined') {
    globalThis.SimulacrumDiagnostics = globalThis.SimulacrumDiagnostics || {
      enable() { globalThis.window.SIMULACRUM_DEV = true; return true; },
      disable() { globalThis.window.SIMULACRUM_DEV = false; return false; },
      status() { return isDebugEnabled(); }
    };
  }
} catch { }

export default { isDebugEnabled };
