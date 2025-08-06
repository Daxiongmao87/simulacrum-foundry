const puppeteer = require('puppeteer');

async function runTest() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }); // Set to false for visual debugging
    const page = await browser.newPage();

    try {
        console.log('Navigating to localhost:30000/join...');
        await page.goto('http://localhost:30000/join', { waitUntil: 'networkidle2' });

        // Wait for any select element with options to appear
        console.log('Waiting for player selection dropdown...');
        await page.waitForSelector('select:has(option)', { visible: true, timeout: 120000 }); // Increased timeout

        // Select "gamemaster" user by its text content in any select element
        console.log('Selecting "gamemaster" user...');
        await page.evaluate(() => {
            const selectElements = document.querySelectorAll('select');
            for (const selectElement of selectElements) {
                const gamemasterOption = Array.from(selectElement.options).find(option => option.textContent.includes('gamemaster'));
                if (gamemasterOption) {
                    gamemasterOption.selected = true;
                    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                    break; // Found and selected, exit loop
                }
            }
        });

        // Click the "Join Game" button (assuming id="join-game")
        console.log('Clicking "Join Game" button...');
        await page.click('#join-game');
        
        // Wait for the game interface to load (e.g., #chat-log) with a very long timeout
        console.log('Waiting for game interface to load (e.g., #chat-log) with extended timeout...');
        await page.waitForSelector('#chat-log', { visible: true, timeout: 120000 }); // Very long timeout

        // Click the Simulacrum button (assuming a specific selector)
        console.log('Clicking Simulacrum button...');
        // This selector might need adjustment based on the actual button in FoundryVTT
        await page.click('button[data-tooltip="Simulacrum"]'); 
        await page.waitForSelector('.app.foundry-im.chat-messages-container', { visible: true, timeout: 120000 }); // Wait for the chat container to appear

        console.log('Inspecting chat container elements...');

        const elementsToInspect = [
            '.app.foundry-im.chat-messages-container',
            '.chat-messages',
            '.message-list',
            '.chat-log'
        ];

        for (const selector of elementsToInspect) {
            const element = await page.$(selector);
            if (element) {
                const dimensions = await element.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return {
                        width: rect.width,
                        height: rect.height,
                        x: rect.x,
                        y: rect.y
                    };
                });
                const cssProperties = await element.evaluate(el => {
                    const style = window.getComputedStyle(el);
                    return {
                        display: style.display,
                        position: style.position,
                        width: style.width,
                        height: style.height,
                        overflow: style.overflow,
                        backgroundColor: style.backgroundColor,
                        border: style.border,
                        padding: style.padding,
                        margin: style.margin
                    };
                });
                console.log(`--- Element: ${selector} ---`);
                console.log('Dimensions:', dimensions);
                console.log('CSS Properties:', cssProperties);
            } else {
                console.log(`Element not found: ${selector}`);
            }
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await browser.close();
    }
}

runTest();