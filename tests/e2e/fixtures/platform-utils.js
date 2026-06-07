import net from 'net';
import AdmZip from 'adm-zip';

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
