#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Files and directories to include in the package
const filesToCopy = [
    'module.json',
    'scripts/',
    'styles/',
    'lang/',
    'assets/',
    'README.md'
];

function copyRecursive(src, dest) {
    const srcPath = path.join(projectRoot, src);
    const destPath = path.join(distDir, src);
    
    if (!fs.existsSync(srcPath)) {
        console.log(`Warning: ${src} not found, skipping`);
        return;
    }
    
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
        // Create directory
        fs.mkdirSync(destPath, { recursive: true });
        
        // Copy contents
        const items = fs.readdirSync(srcPath);
        for (const item of items) {
            copyRecursive(path.join(src, item), '');
        }
    } else {
        // Copy file
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied: ${src}`);
    }
}

console.log('Packaging Foundry module...');

// Clean dist directory
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
    fs.mkdirSync(distDir);
}

// Copy files
for (const file of filesToCopy) {
    copyRecursive(file, '');
}

console.log(`Module packaged to: ${distDir}`);