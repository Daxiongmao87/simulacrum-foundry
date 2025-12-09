#!/usr/bin/env node

import { mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    image: 'simulacrum-foundry',
    tag: 'v13-local',
    name: null,
    port: 30051,
    data: join(ROOT, '.foundry-data')
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--image' || a === '-i') && args[i + 1]) out.image = args[++i];
    else if ((a === '--tag' || a === '-t') && args[i + 1]) out.tag = args[++i];
    else if ((a === '--name' || a === '-n') && args[i + 1]) out.name = args[++i];
    else if ((a === '--port' || a === '-p') && args[i + 1]) out.port = Number(args[++i]);
    else if (a === '--data' && args[i + 1]) out.data = resolve(args[++i]);
  }
  if (!out.name) out.name = `foundry-v13-${out.port}`;
  return out;
}

async function main() {
  const { image, tag, name, port, data } = parseArgs();
  const imageRef = `${image}:${tag}`;
  try { mkdirSync(data, { recursive: true }); } catch { }

  // Stop any existing container with same name to avoid conflicts
  try { execSync(`docker rm -f ${name}`, { stdio: 'ignore' }); } catch { }

  const args = [
    'run', '--rm', '--name', name,
    '-d',
    '-p', `${port}:30000`,
    '-v', `${data}:/data`,
    '-e', `FOUNDRY_LICENSE_KEY=HT6S-SUP1-9PMZ-QL6X-LK4L-FONR`,
    imageRef
  ];

  const child = spawn('docker', args, { stdio: 'ignore', detached: true });
  child.unref();
  console.log(`[run-detached] Started ${name} (detached) at http://localhost:${port}`);
}

main().catch((e) => { console.error('[run-detached] Failed:', e.message); process.exit(1); });
