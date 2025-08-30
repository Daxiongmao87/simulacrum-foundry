#!/usr/bin/env node

/**
 * @file Static Analysis Coverage Tool
 * @description Analyzes code reachability from entry points using static import analysis
 * 
 * Unlike test-based coverage, this tool traces actual import dependencies
 * from entry points (main.js) to identify truly dead code and unused files.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(PROJECT_ROOT, 'scripts');

class StaticAnalysisCoverage {
  constructor() {
    this.visited = new Set();
    this.importGraph = new Map();
    this.deadFiles = new Set();
    this.deadFunctions = new Set();
    this.usedExports = new Map(); // Track which exports are actually imported
    this.allExports = new Map(); // Track all exports in each file
    this.errors = [];
  }

  /**
   * Extract import statements and track which specific exports are used
   * @param {string} filePath - Absolute path to the file
   * @returns {object} Object with imports array and usedExports map
   */
  extractImports(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const imports = [];
      const usedExports = {};
      
      // Match different import patterns
      const patterns = [
        // import { name1, name2 } from './file'
        /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
        // import name from './file'
        /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        // import * as name from './file'
        /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        // import './file' (side effect)
        /import\s+['"]([^'"]+)['"]/g
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          let importPath, importedNames;
          
          if (pattern.source.includes('{')) {
            // Named imports: import { name1, name2 } from './file'
            importedNames = match[1].split(',').map(n => n.trim().split(' as ')[0]);
            importPath = match[2];
          } else if (pattern.source.includes('\\*')) {
            // Namespace import: import * as name from './file'
            importedNames = ['*']; // All exports used
            importPath = match[2];
          } else if (match.length === 3) {
            // Default import: import name from './file'
            importedNames = ['default'];
            importPath = match[2];
          } else {
                      // Side effect import: import './file'  
          importedNames = ['*']; // All exports potentially used
          importPath = match[1];
          }
          
          // Skip Node.js built-ins and npm packages
          if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            continue;
          }
          
          // Resolve relative paths
          let resolvedPath = resolve(dirname(filePath), importPath);
          
          // Add .js extension if missing
          if (!resolvedPath.endsWith('.js') && existsSync(resolvedPath + '.js')) {
            resolvedPath += '.js';
          }
          
          // Only include files within scripts directory
          if (resolvedPath.startsWith(SCRIPTS_DIR) && existsSync(resolvedPath)) {
            imports.push(resolvedPath);
            if (!usedExports[resolvedPath]) {
              usedExports[resolvedPath] = new Set();
            }
            for (const name of importedNames) {
              usedExports[resolvedPath].add(name);
            }
          }
        }
      }
      
      return { imports, usedExports };
    } catch (error) {
      this.errors.push(`Failed to read ${filePath}: ${error.message}`);
      return { imports: [], usedExports: {} };
    }
  }

  /**
   * Extract exported functions and classes from a file
   * @param {string} filePath - Absolute path to the file
   * @returns {string[]} Array of exported symbol names
   */
  extractExports(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const exports = [];
      
      // Match export statements
      const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
      const exportFromRegex = /export\s+\{([^}]+)\}/g;
      const defaultExportRegex = /export\s+default\s+(\w+)/g;
      
      let match;
      
      // Extract named exports
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      
      // Extract export { name } statements
      while ((match = exportFromRegex.exec(content)) !== null) {
        const names = match[1].split(',').map(n => n.trim().split(' as ')[0]);
        exports.push(...names);
      }
      
      // Extract default exports
      while ((match = defaultExportRegex.exec(content)) !== null) {
        exports.push(`default:${match[1]}`);
      }
      
      return exports;
    } catch (error) {
      this.errors.push(`Failed to extract exports from ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Recursively trace imports from an entry point
   * @param {string} filePath - Starting file path
   */
  traceImports(filePath) {
    if (this.visited.has(filePath)) {
      return;
    }
    
    this.visited.add(filePath);
    
    const { imports, usedExports } = this.extractImports(filePath);
    const exports = this.extractExports(filePath);
    
    this.importGraph.set(filePath, {
      imports,
      exports
    });
    
    // Track all exports for this file
    this.allExports.set(filePath, new Set(exports));
    
    // Track which exports are used
    for (const [importedFile, exportNames] of Object.entries(usedExports)) {
      if (!this.usedExports.has(importedFile)) {
        this.usedExports.set(importedFile, new Set());
      }
      for (const exportName of exportNames) {
        this.usedExports.get(importedFile).add(exportName);
      }
    }
    
    // Recursively trace imports
    for (const importedFile of imports) {
      this.traceImports(importedFile);
    }
  }

  /**
   * Find all JavaScript files in scripts directory
   * @returns {string[]} Array of all script file paths
   */
  getAllScriptFiles() {
    const allFiles = [];
    
    const scanDirectory = (dir) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory() && entry.name !== 'fimlib') { // Skip submodules
          scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          allFiles.push(fullPath);
        }
      }
    };
    
    scanDirectory(SCRIPTS_DIR);
    return allFiles;
  }

  /**
   * Analyze code coverage from entry points
   * @param {string[]} entryPoints - Array of entry point file paths
   * @returns {object} Coverage analysis results
   */
  analyze(entryPoints) {
    console.log('🔍 Starting static analysis coverage...');
    
    // Trace imports from each entry point
    for (const entryPoint of entryPoints) {
      if (existsSync(entryPoint)) {
        console.log(`📋 Tracing imports from: ${relative(PROJECT_ROOT, entryPoint)}`);
        this.traceImports(entryPoint);
      } else {
        this.errors.push(`Entry point not found: ${entryPoint}`);
      }
    }
    
    // Find all script files
    const allFiles = this.getAllScriptFiles();
    
    // Identify dead files (not reachable from entry points)
    for (const file of allFiles) {
      if (!this.visited.has(file)) {
        this.deadFiles.add(file);
      }
    }
    
    // Identify dead functions (exported but never imported)
    const deadFunctions = [];
    for (const [filePath, allExports] of this.allExports.entries()) {
      const usedExports = this.usedExports.get(filePath) || new Set();
      const fileName = relative(PROJECT_ROOT, filePath);
      
      for (const exportName of allExports) {
        // Skip if this export is used, or if all exports are used via *
        if (!usedExports.has(exportName) && !usedExports.has('*')) {
          // Skip known global patterns that aren't detected by import analysis
          const isGlobalPattern = (
            // Error handling classes used via new ClassName()
            fileName.includes('error-handling.js') ||
            // Logger used via game.simulacrum.logger
            fileName.includes('logger.js') ||
            // Schema functions might be used internally
            (fileName.includes('schema.js') && exportName.includes('Schema'))
          );
          
          if (!isGlobalPattern) {
            deadFunctions.push({
              file: fileName,
              function: exportName
            });
          }
        }
      }
    }
    
    const totalFiles = allFiles.length;
    const reachableFiles = this.visited.size;
    const deadFileCount = this.deadFiles.size;
    
    return {
      totalFiles,
      reachableFiles,
      deadFileCount,
      deadFunctionCount: deadFunctions.length,
      coveragePercentage: ((reachableFiles / totalFiles) * 100).toFixed(2),
      deadFiles: Array.from(this.deadFiles),
      deadFunctions,
      reachableFiles: Array.from(this.visited),
      importGraph: this.importGraph,
      errors: this.errors
    };
  }

  /**
   * Generate coverage report
   * @param {object} results - Analysis results
   * @param {boolean} verbose - Show detailed information
   */
  generateReport(results, verbose = false) {
    console.log('\n📊 Static Analysis Coverage Report');
    console.log('=====================================');
    console.log(`📁 Total Files: ${results.totalFiles}`);
    console.log(`✅ Reachable Files: ${results.reachableFiles}`);
    console.log(`❌ Dead Files: ${results.deadFileCount}`);
    console.log(`🔧 Dead Functions: ${results.deadFunctionCount}`);
    console.log(`📈 File Coverage: ${results.coveragePercentage}%`);
    
    let hasIssues = false;
    
    if (results.deadFiles.length > 0) {
      hasIssues = true;
      console.log('\n🚨 Dead Files (Not Reachable from Entry Points):');
      console.log('================================================');
      for (const deadFile of results.deadFiles) {
        const relativePath = relative(PROJECT_ROOT, deadFile);
        console.log(`❌ ${relativePath}`);
        
        if (verbose) {
          const exports = this.extractExports(deadFile);
          if (exports.length > 0) {
            console.log(`   Exports: ${exports.join(', ')}`);
          }
        }
      }
    }
    
    if (results.deadFunctions.length > 0) {
      hasIssues = true;
      console.log('\n🔧 Dead Functions (Exported but Never Imported):');
      console.log('===============================================');
      for (const { file, function: funcName } of results.deadFunctions) {
        console.log(`🔧 ${file}:${funcName}`);
      }
      
      if (results.deadFunctions.length > 10 && !verbose) {
        console.log(`   ... and ${results.deadFunctions.length - 10} more (use --verbose to see all)`);
      }
    }
    
    if (verbose && results.reachableFiles.length > 0) {
      console.log('\n✅ Reachable Files:');
      console.log('==================');
      for (const file of results.reachableFiles) {
        const relativePath = relative(PROJECT_ROOT, file);
        console.log(`✅ ${relativePath}`);
      }
    }
    
    if (results.errors.length > 0) {
      console.log('\n⚠️ Analysis Errors:');
      console.log('==================');
      for (const error of results.errors) {
        console.log(`⚠️ ${error}`);
      }
    }
    
    return !hasIssues;
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const threshold = args.find(arg => arg.startsWith('--threshold='))?.split('=')[1] || 80;
  const failOnDead = !args.includes('--no-fail');
  
  const analyzer = new StaticAnalysisCoverage();
  
  // Define entry points
  const entryPoints = [
    join(SCRIPTS_DIR, 'main.js')
  ];
  
  console.log(`🎯 Entry Points: ${entryPoints.map(p => relative(PROJECT_ROOT, p)).join(', ')}`);
  
  const results = analyzer.analyze(entryPoints);
  const success = analyzer.generateReport(results, verbose);
  
  // Check threshold
  const coverageNum = parseFloat(results.coveragePercentage);
  if (coverageNum < threshold) {
    console.log(`\n❌ Coverage ${results.coveragePercentage}% is below threshold ${threshold}%`);
    if (failOnDead) {
      process.exit(1);
    }
  } else {
    console.log(`\n✅ Coverage ${results.coveragePercentage}% meets threshold ${threshold}%`);
  }
  
  if (!success && failOnDead) {
    console.log('\n🚨 Dead code detected - use --no-fail to continue anyway');
    process.exit(1);
  }
  
  console.log('\n✅ Static analysis complete');
}

// Help function
function showHelp() {
  console.log(`
Static Analysis Coverage Tool

Usage:
  node tools/static-analysis-coverage.js [options]

Options:
  --verbose, -v          Show detailed file listings
  --threshold=N          Set coverage threshold percentage (default: 80)
  --no-fail             Don't exit with error on dead code detection
  --help, -h            Show this help message

Examples:
  node tools/static-analysis-coverage.js                    # Basic analysis
  node tools/static-analysis-coverage.js --verbose          # Detailed output
  node tools/static-analysis-coverage.js --threshold=90     # 90% threshold
  node tools/static-analysis-coverage.js --no-fail          # Don't fail on dead code
`);
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    main().catch(error => {
      console.error(`❌ Static analysis failed: ${error.message}`);
      process.exit(1);
    });
  }
}

export { StaticAnalysisCoverage };