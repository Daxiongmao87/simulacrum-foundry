
import puppeteer from 'puppeteer';
import readline from 'readline';

async function runCssInspector() {
    let browser;
    let page;

    try {
        console.log('🚀 Launching Puppeteer browser in non-headless mode...');
        browser = await puppeteer.launch({
            headless: false, // Set to false for manual navigation
            executablePath: '/snap/bin/chromium', // Ensure this path is correct for your system
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const targetUrl = 'http://localhost:30000';
        console.log(`🌐 Navigating to ${targetUrl}. Please manually navigate to the game within the browser.`);
        await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded', // Wait for initial page load
            timeout: 0 // Wait indefinitely for manual navigation
        });

        // Prompt for manual continuation
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise(resolve => {
            rl.question('Press any key to continue with CSS inspection after manual navigation... ', () => {
                rl.close();
                resolve();
            });
        });

        console.log('🔍 Continuing with CSS inspection...');

        // --- CSS Inspection Logic (Placeholder) ---
        // Example: Get computed style of the body element
        const bodyComputedStyle = await page.evaluate(() => {
            const body = document.body;
            if (!body) return null;
            const style = window.getComputedStyle(body);
            const relevantStyles = {};
            // Add specific CSS properties you want to inspect
            relevantStyles.backgroundColor = style.backgroundColor;
            relevantStyles.color = style.color;
            relevantStyles.fontFamily = style.fontFamily;
            relevantStyles.fontSize = style.fontSize;
            relevantStyles.lineHeight = style.lineHeight;
            relevantStyles.width = style.width;
            relevantStyles.height = style.height;
            return relevantStyles;
        });

        if (bodyComputedStyle) {
            console.log('✅ Computed styles of <body>:');
            console.log(JSON.stringify(bodyComputedStyle, null, 2));
        } else {
            console.log('⚠️ Could not retrieve computed styles for <body>.');
        }

        // You can add more specific CSS inspection here.
        // For example, to inspect a specific element:
        // const elementSelector = '.chat-message'; // Replace with your target element selector
        // const elementStyle = await page.evaluate((selector) => {
        //     const element = document.querySelector(selector);
        //     if (!element) return null;
        //     const style = window.getComputedStyle(element);
        //     return {
        //         display: style.display,
        //         padding: style.padding,
        //         margin: style.margin,
        //         // Add more properties as needed
        //     };
        // }, elementSelector);

        // if (elementStyle) {
        //     console.log(`✅ Computed styles of '${elementSelector}':`);
        //     console.log(JSON.stringify(elementStyle, null, 2));
        // } else {
        //     console.log(`⚠️ Could not retrieve computed styles for '${elementSelector}'.`);
        // }

    } catch (error) {
        console.error('❌ An error occurred:', error.message);
    } finally {
        if (browser) {
            console.log('🔒 Closing browser...');
            await browser.close();
        }
        console.log('Script finished.');
    }
}

runCssInspector();
