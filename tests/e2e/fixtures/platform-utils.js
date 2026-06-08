import net from 'net';
import os from 'os';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';

/**
 * Locate the user's Foundry license.json, which contains the signed EULA
 * acceptance. Pre-placing this in a test instance's Config/ skips the
 * license-entry and EULA screens entirely.
 *
 * Resolution order:
 *   1. FOUNDRY_LICENSE_JSON_PATH env var (explicit override)
 *   2. Platform default (%LOCALAPPDATA%\FoundryVTT\Config\license.json on Windows,
 *      ~/.local/share/FoundryVTT/Config/license.json on Linux/Mac)
 *
 * Returns the file contents as a string, or null if not found.
 */
export function resolveLicenseJson() {
  const envPath = process.env.FOUNDRY_LICENSE_JSON_PATH;
  if (envPath && existsSync(envPath)) return readFileSync(envPath, 'utf-8');

  const defaults = {
    win32: join(process.env.LOCALAPPDATA || '', 'FoundryVTT', 'Config', 'license.json'),
    darwin: join(os.homedir(), 'Library', 'Application Support', 'FoundryVTT', 'Config', 'license.json'),
    linux: join(os.homedir(), '.local', 'share', 'FoundryVTT', 'Config', 'license.json'),
  };
  const defaultPath = defaults[process.platform];
  if (defaultPath && existsSync(defaultPath)) return readFileSync(defaultPath, 'utf-8');

  return null;
}

export function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export function isPortInUse(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let resolved = false;
    const finish = inUse => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

export async function waitForPortFree(port, { timeoutMs = 5000, pollIntervalMs = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortInUse(port))) return true;
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  return !(await isPortInUse(port));
}

export async function killAndWait(child, {
  signal = 'SIGTERM',
  escalateAfterMs = 2000,
  timeoutMs = 8000,
} = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise(resolve => {
    child.once('exit', () => resolve());
    child.once('close', () => resolve());
  });

  try { child.kill(signal); } catch { /* already dead */ }

  // SIGTERM is async on Windows; escalate to SIGKILL if it doesn't take effect.
  const escalation = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already dead */ }
  }, escalateAfterMs);

  const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
  await Promise.race([exited, timeout]);
  clearTimeout(escalation);
}
