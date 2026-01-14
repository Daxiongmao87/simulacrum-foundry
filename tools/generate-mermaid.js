#!/usr/bin/env node
/**
 * Generate Mermaid class diagram from JavaScript ES6 source files.
 * Parses classes, their methods, properties, and inheritance relationships.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Patterns for parsing ES6 classes
const CLASS_PATTERN = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
const METHOD_PATTERN = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm;
const PROPERTY_PATTERN = /^\s*(?:this\.)?(\w+)\s*=/gm;
const CONSTRUCTOR_PATTERN = /constructor\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s;

function parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const classes = [];

    let match;
    while ((match = CLASS_PATTERN.exec(content)) !== null) {
        const className = match[1];
        const extendsClass = match[2] || null;

        // Find class body
        const startIndex = match.index + match[0].length;
        let braceCount = 1;
        let endIndex = startIndex;

        while (braceCount > 0 && endIndex < content.length) {
            if (content[endIndex] === '{') braceCount++;
            if (content[endIndex] === '}') braceCount--;
            endIndex++;
        }

        const classBody = content.substring(startIndex, endIndex - 1);

        // Extract methods
        const methods = [];
        const methodPattern = /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{/gm;
        let methodMatch;
        while ((methodMatch = methodPattern.exec(classBody)) !== null) {
            const methodName = methodMatch[1];
            if (methodName !== 'constructor') {
                methods.push(methodName);
            }
        }

        // Extract properties from constructor
        const properties = [];
        const constructorMatch = CONSTRUCTOR_PATTERN.exec(classBody);
        if (constructorMatch) {
            const constructorBody = constructorMatch[1];
            const propPattern = /this\.(\w+)\s*=/g;
            let propMatch;
            while ((propMatch = propPattern.exec(constructorBody)) !== null) {
                if (!properties.includes(propMatch[1])) {
                    properties.push(propMatch[1]);
                }
            }
        }

        classes.push({
            name: className,
            extends: extendsClass,
            methods: [...new Set(methods)], // dedupe
            properties: [...new Set(properties)],
            file: path.relative(process.cwd(), filePath)
        });
    }

    return classes;
}

function scanDirectory(dir, allClasses = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDirectory(fullPath, allClasses);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                const classes = parseFile(fullPath);
                allClasses.push(...classes);
            } catch (e) {
                console.error(`Error parsing ${fullPath}: ${e.message}`);
            }
        }
    }

    return allClasses;
}

function generateMermaid(classes) {
    const lines = ['classDiagram'];

    // Add classes with members
    for (const cls of classes) {
        lines.push(`  class ${cls.name} {`);

        // Properties
        for (const prop of cls.properties.slice(0, 10)) { // limit to 10 for readability
            lines.push(`    +${prop}`);
        }
        if (cls.properties.length > 10) {
            lines.push(`    ... ${cls.properties.length - 10} more properties`);
        }

        // Methods
        for (const method of cls.methods.slice(0, 15)) { // limit to 15
            const visibility = method.startsWith('_') ? '-' : '+';
            lines.push(`    ${visibility}${method}()`);
        }
        if (cls.methods.length > 15) {
            lines.push(`    ... ${cls.methods.length - 15} more methods`);
        }

        lines.push('  }');
    }

    // Add inheritance relationships
    for (const cls of classes) {
        if (cls.extends) {
            lines.push(`  ${cls.extends} <|-- ${cls.name}`);
        }
    }

    // Add comment with file info
    lines.push('');
    lines.push('%% File mapping:');
    for (const cls of classes) {
        lines.push(`%% ${cls.name}: ${cls.file}`);
    }

    return lines.join('\n');
}

// Main
const inputDir = process.argv[2] || 'scripts';
const outputFile = process.argv[3] || 'docs/project-uml.mmd';

console.log(`Scanning ${inputDir}...`);
const classes = scanDirectory(inputDir);
console.log(`Found ${classes.length} classes`);

const mermaid = generateMermaid(classes);
fs.writeFileSync(outputFile, mermaid);
console.log(`Mermaid diagram written to ${outputFile}`);
