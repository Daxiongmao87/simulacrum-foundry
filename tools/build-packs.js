#!/usr/bin/env node
/**
 * Build packs using the official Foundry VTT CLI.
 * This ensures LevelDB files are in the exact format Foundry expects.
 */
import { execSync } from 'child_process';
import { existsSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Pack definitions: [sourceName, outputName]
const PACKS = [
    ['simulacrum-tools', 'simulacrum-tools']
];

async function build() {
    for (const [sourceName, outputName] of PACKS) {
        const sourceDir = join(ROOT, 'packs', '_source', sourceName);
        const outputDir = join(ROOT, 'packs', outputName);

        if (!existsSync(sourceDir)) {
            console.log(`Skipping ${sourceName}: source directory not found`);
            continue;
        }

        // Clean output directory
        if (existsSync(outputDir)) {
            rmSync(outputDir, { recursive: true, force: true });
        }

        console.log(`Building pack: ${sourceName} -> ${outputName}`);

        // Use official Foundry CLI
        const cmd = `npx fvtt package pack --type Module --id simulacrum -n ${outputName} --in "${sourceDir}" --out "${join(ROOT, 'packs')}" -v`;

        try {
            const result = execSync(cmd, {
                cwd: ROOT,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            console.log(result);
        } catch (err) {
            console.error(`Failed to build ${sourceName}:`, err.message);
            if (err.stderr) console.error(err.stderr);
            process.exit(1);
        }
    }

    console.log('All packs built successfully.');
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
