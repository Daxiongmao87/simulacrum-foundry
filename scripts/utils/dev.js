/**
 * Developer diagnostics helpers (console-only)
 * No game settings used; toggled via globals or URL param.
 */

/**
 * Returns whether diagnostics are enabled.
 * - window.SIMULACRUM_DEV === true
 * - CONFIG.debug.simulacrum === true
 * - URL contains ?simulacrumDev=1
 */
export function isDebugEnabled() {
  const byWindow = globalThis.window?.SIMULACRUM_DEV === true;
  const byConfig = globalThis.CONFIG?.debug?.simulacrum === true;

  if (byWindow || byConfig) return true;

  try {
    const search = globalThis.location?.search;
    if (search) {
      const q = new URLSearchParams(search).get('simulacrumDev');
      if (q === '1') return true;
      if (q === '0') return false;
    }
  } catch {
    /* empty */
  }

  return false; // Default disabled in production
}

// Optional helpers for quick toggling via console
try {
  if (typeof globalThis.window !== 'undefined') {
    globalThis.SimulacrumDiagnostics = globalThis.SimulacrumDiagnostics || {
      enable() {
        globalThis.window.SIMULACRUM_DEV = true;
        return true;
      },
      disable() {
        globalThis.window.SIMULACRUM_DEV = false;
        return false;
      },
      status() {
        return isDebugEnabled();
      },
    };
  }
} catch {
  /* intentionally empty */
}

export default { isDebugEnabled };
