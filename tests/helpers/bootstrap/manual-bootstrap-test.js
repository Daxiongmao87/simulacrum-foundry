#!/usr/bin/env node

/**
 * @file tests/manual-bootstrap-test.js
 * @description Manual testing script for the bootstrap system
 * 
 * This script can be run manually to test the bootstrap system against a real
 * FoundryVTT container. It demonstrates the complete workflow.
 * 
 * Usage:
 *   node tests/manual-bootstrap-test.js [scenario] [options]
 * 
 * Examples:
 *   node tests/manual-bootstrap-test.js dnd5e
 *   node tests/manual-bootstrap-test.js pf2e --debug
 *   node tests/manual-bootstrap-test.js multi-system --screenshots
 */

import puppeteer from 'puppeteer';
import { 
  runBootstrap, 
  quickBootstrap,
  getBootstrapErrorInfo 
} from './helpers/bootstrap/index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const scenario = args[0] || 'dnd5e';
const options = {
  takeScreenshots: args.includes('--screenshots'),
  debug: args.includes('--debug'),
  retryOnFailure: !args.includes('--no-retry'),
  maxRetries: args.includes('--no-retry') ? 0 : 2
};

console.log('🚀 Manual Bootstrap Test');
console.log('========================');
console.log(`Scenario: ${scenario}`);
console.log(`Options:`, options);
console.log('');

async function runManualTest() {
  let browser;
  let page;
  
  try {
    // Launch browser
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: !options.debug,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1366, height: 768 }
    });
    
    page = await browser.newPage();
    
    // Enable console logging
    page.on('console', (msg) => {
      console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
    });
    
    // Navigate to FoundryVTT (assuming it's running on localhost:30000)
    console.log('📍 Navigating to FoundryVTT...');
    await page.goto('http://localhost:30000', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    
    console.log(`✅ FoundryVTT loaded at: ${page.url()}`);
    
    // Run bootstrap based on scenario
    console.log(`🎯 Running bootstrap for scenario: ${scenario}`);
    
    let bootstrapResult;
    
    switch (scenario) {
      case 'dnd5e':
        bootstrapResult = await quickBootstrap.dnd5e(page, options);
        break;
      case 'pf2e':
        bootstrapResult = await quickBootstrap.pf2e(page, options);
        break;
      case 'multi-system':
        bootstrapResult = await quickBootstrap.multiSystem(page, options);
        break;
      case 'debug':
        bootstrapResult = await quickBootstrap.debug(page, options);
        break;
      default:
        // Use custom scenario
        bootstrapResult = await runBootstrap(page, scenario, options);
    }
    
    // Display results
    console.log('\n📊 Bootstrap Results');
    console.log('===================');
    console.log(`Success: ${bootstrapResult.success ? '✅' : '❌'}`);
    console.log(`Status: ${bootstrapResult.status}`);
    
    if (bootstrapResult.success) {
      console.log('\n🎉 Bootstrap completed successfully!');
      
      if (bootstrapResult.results) {
        console.log('\nStep Results:');
        Object.entries(bootstrapResult.results).forEach(([step, result]) => {
          const status = result.success ? '✅' : '❌';
          const details = result.details ? ` - ${result.details}` : '';
          console.log(`  ${step}: ${status}${details}`);
        });
      }
      
      // Take final screenshot if enabled
      if (options.takeScreenshots) {
        const screenshotPath = `manual-test-${scenario}-success.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Success screenshot saved: ${screenshotPath}`);
      }
      
    } else {
      console.log('\n❌ Bootstrap failed!');
      console.log(`Details: ${bootstrapResult.details}`);
      
      // Get enhanced error information
      const errorInfo = await getBootstrapErrorInfo(bootstrapResult, page);
      console.log('\n🔍 Error Analysis:');
      console.log(`  Completed Steps: ${errorInfo.analysis.completedSteps.join(', ')}`);
      console.log(`  Failure Points: ${errorInfo.analysis.failurePoints.length}`);
      
      if (errorInfo.analysis.failurePoints.length > 0) {
        errorInfo.analysis.failurePoints.forEach((failure, index) => {
          console.log(`    ${index + 1}. ${failure.step}: ${failure.details}`);
        });
      }
      
      // Take error screenshot if enabled
      if (options.takeScreenshots) {
        const screenshotPath = `manual-test-${scenario}-error.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Error screenshot saved: ${screenshotPath}`);
      }
    }
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Take error screenshot if possible
    if (page && options.takeScreenshots) {
      try {
        const screenshotPath = `manual-test-${scenario}-exception.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Exception screenshot saved: ${screenshotPath}`);
      } catch (screenshotError) {
        console.log('⚠️ Could not save exception screenshot');
      }
    }
    
  } finally {
    // Cleanup
    if (browser) {
      console.log('\n🧹 Cleaning up browser...');
      await browser.close();
    }
    
    console.log('\n🏁 Manual test completed');
  }
}

// Run the test
runManualTest().catch(console.error);
