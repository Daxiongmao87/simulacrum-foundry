#!/usr/bin/env node
/**
 * Build packs using the official Foundry VTT CLI.
 * This ensures LevelDB files are in the exact format Foundry expects.
 *
 * Macro scripts: If a .json source file has a matching .js file (same basename),
 * the .js content is injected into the JSON's `command` field at build time.
 * This keeps macro scripts maintainable as standalone JS files.
 */
import { execSync } from 'child_process';
import { existsSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Pack definitions: [sourceName, outputName]
const PACKS = [
    ['simulacrum-tools', 'simulacrum-tools']
];

/**
 * Prepare a staging directory with JS scripts injected into JSON command fields.
 * @param {string} sourceDir - Path to the _source directory for this pack
 * @returns {string} Path to the staging directory (caller must clean up)
 */
function prepareStaging(sourceDir) {
    const stagingDir = join(ROOT, 'packs', '_staging');
    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });

    // Copy all JSON files and inject matching JS scripts
    const files = readdirSync(sourceDir);
    const jsonFiles = files.filter(f => extname(f) === '.json');

    for (const jsonFile of jsonFiles) {
        const doc = JSON.parse(readFileSync(join(sourceDir, jsonFile), 'utf-8'));
        const jsFile = basename(jsonFile, '.json') + '.js';

        if (files.includes(jsFile)) {
            const script = readFileSync(join(sourceDir, jsFile), 'utf-8');
            doc.command = script;
            console.log(`  Injected ${jsFile} -> ${jsonFile}`);
        }

        writeFileSync(join(stagingDir, jsonFile), JSON.stringify(doc, null, 4) + '\n');
    }

    return stagingDir;
}

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

        // Prepare staging with injected scripts
        const stagingDir = prepareStaging(sourceDir);

        // Use official Foundry CLI
        const cmd = `npx fvtt package pack --type Module --id simulacrum -n ${outputName} --in "${stagingDir}" --out "${join(ROOT, 'packs')}" -v`;

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
        } finally {
            // Clean up staging
            rmSync(stagingDir, { recursive: true, force: true });
        }
    }

    console.log('All packs built successfully.');
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
