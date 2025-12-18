const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const PORT = 8765;

// Simple static file server
function createServer() {
    return http.createServer((req, res) => {
        const html = fs.readFileSync(HTML_PATH, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });
}

async function runTests() {
    const server = createServer();
    await new Promise(resolve => server.listen(PORT, resolve));
    console.log(`Server running on http://localhost:${PORT}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    let passed = 0;
    let failed = 0;

    try {
        // Test 1: Page loads correctly
        console.log('\n--- Test 1: Page loads correctly ---');
        await page.goto(`http://localhost:${PORT}`);
        const title = await page.title();
        if (title === 'YouTube Transcript Cleaner') {
            console.log('✓ Title is correct');
            passed++;
        } else {
            console.log(`✗ Title is "${title}", expected "YouTube Transcript Cleaner"`);
            failed++;
        }

        // Test 2: Header is visible
        console.log('\n--- Test 2: Header is visible ---');
        const header = await page.locator('h1').textContent();
        if (header === 'YouTube Transcript Cleaner') {
            console.log('✓ Header text is correct');
            passed++;
        } else {
            console.log(`✗ Header text is "${header}"`);
            failed++;
        }

        // Test 3: Wait for JQ to load
        console.log('\n--- Test 3: JQ WASM loads ---');
        await page.waitForFunction(() => {
            return typeof jq !== 'undefined' && jq.json;
        }, { timeout: 15000 });
        console.log('✓ JQ WASM loaded successfully');
        passed++;

        // Test 4: Input textarea exists and is enabled
        console.log('\n--- Test 4: Input textarea is enabled ---');
        const inputEnabled = await page.locator('#input').isEnabled();
        if (inputEnabled) {
            console.log('✓ Input textarea is enabled');
            passed++;
        } else {
            console.log('✗ Input textarea is disabled');
            failed++;
        }

        // Test 5: Process button exists
        console.log('\n--- Test 5: Process button exists ---');
        const processBtn = page.locator('button:has-text("Process Transcript")');
        const btnExists = await processBtn.count() > 0;
        if (btnExists) {
            console.log('✓ Process button exists');
            passed++;
        } else {
            console.log('✗ Process button not found');
            failed++;
        }

        // Test 6: Process valid JSON
        console.log('\n--- Test 6: Process valid transcript JSON ---');
        const testJSON = '[{"events":[{"tStartMs":0,"dDurationMs":5000,"segs":[{"utf8":"Hello and welcome to this video."}]},{"tStartMs":5000,"dDurationMs":4000,"segs":[{"utf8":"Today we are going to talk about\\n"}]},{"tStartMs":9000,"dDurationMs":3000,"segs":[{"utf8":"something really interesting."}]}]}]';

        await page.locator('#input').fill(testJSON);
        await page.locator('button:has-text("Process Transcript")').click();

        // Wait for output to appear
        await page.waitForSelector('#output', { state: 'visible', timeout: 5000 });
        const output = await page.locator('#output').inputValue();

        const expectedOutput = 'Hello and welcome to this video.Today we are going to talk about something really interesting.';
        if (output === expectedOutput) {
            console.log('✓ Output matches expected result');
            passed++;
        } else {
            console.log(`✗ Output mismatch`);
            console.log(`  Expected: "${expectedOutput}"`);
            console.log(`  Got: "${output}"`);
            failed++;
        }

        // Test 7: Word count displays correctly
        console.log('\n--- Test 7: Word count is correct ---');
        const wordCountText = await page.locator('text=/\\d+ words/').textContent();
        if (wordCountText && wordCountText.includes('15 words')) {
            console.log('✓ Word count is correct (15 words)');
            passed++;
        } else {
            console.log(`✗ Word count text: "${wordCountText}"`);
            failed++;
        }

        // Test 8: Character count displays correctly
        console.log('\n--- Test 8: Character count is correct ---');
        const charCountText = await page.locator('text=/\\d+ characters/').textContent();
        // "Hello and welcome to this video." (32) + "Today we are going to talk about " (33) + "something really interesting." (29) = 94
        if (charCountText && charCountText.includes('94 characters')) {
            console.log('✓ Character count is correct (94 characters)');
            passed++;
        } else {
            console.log(`✗ Character count text: "${charCountText}"`);
            failed++;
        }

        // Test 9: Copy button exists
        console.log('\n--- Test 9: Copy to Clipboard button exists ---');
        const copyBtn = page.locator('button:has-text("Copy to Clipboard")');
        const copyBtnExists = await copyBtn.count() > 0;
        if (copyBtnExists) {
            console.log('✓ Copy to Clipboard button exists');
            passed++;
        } else {
            console.log('✗ Copy button not found');
            failed++;
        }

        // Test 10: Clear button works
        console.log('\n--- Test 10: Clear button works ---');
        await page.locator('button:has-text("Clear")').click();
        const inputAfterClear = await page.locator('#input').inputValue();
        if (inputAfterClear === '') {
            console.log('✓ Input cleared successfully');
            passed++;
        } else {
            console.log('✗ Input not cleared');
            failed++;
        }

        // Test 11: Error on invalid JSON
        console.log('\n--- Test 11: Error on invalid JSON ---');
        await page.locator('#input').fill('this is not valid json');
        await page.locator('button:has-text("Process Transcript")').click();

        // Wait for error to appear
        await page.waitForSelector('text=/Invalid JSON/', { timeout: 5000 });
        console.log('✓ Error displayed for invalid JSON');
        passed++;

        // Test 12: Error clears when typing
        console.log('\n--- Test 12: Error clears when typing ---');
        await page.locator('#input').fill('typing new content');
        const errorVisible = await page.locator('text=/Invalid JSON/').isVisible();
        if (!errorVisible) {
            console.log('✓ Error cleared after typing');
            passed++;
        } else {
            console.log('✗ Error still visible after typing');
            failed++;
        }

    } catch (err) {
        console.log(`\n✗ Test error: ${err.message}`);
        failed++;
    }

    console.log('\n========================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('========================================\n');

    await browser.close();
    server.close();

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
