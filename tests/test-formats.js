const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const PORT = 8767;

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
        await page.goto(`http://localhost:${PORT}`);

        // Wait for JQ to load
        await page.waitForFunction(() => typeof jq !== 'undefined' && jq.promised, { timeout: 15000 });

        // Test Format 1: Array of objects with events (original format from spec)
        console.log('\n--- Test Format 1: Array with events objects ---');
        const format1 = '[{"events":[{"segs":[{"utf8":"Hello "}]},{"segs":[{"utf8":"World"}]}]}]';
        await page.locator('#input').fill(format1);
        await page.locator('button:has-text("Process Transcript")').click();
        await page.waitForSelector('#output', { state: 'visible', timeout: 5000 });
        let output = await page.locator('#output').inputValue();
        if (output === 'Hello World') {
            console.log('✓ Format 1 works: "Hello World"');
            passed++;
        } else {
            console.log(`✗ Format 1 failed. Got: "${output}"`);
            failed++;
        }
        await page.locator('button:has-text("Clear")').click();

        // Test Format 2: Single object with events (not in array)
        console.log('\n--- Test Format 2: Single object with events ---');
        const format2 = '{"events":[{"segs":[{"utf8":"Test "}]},{"segs":[{"utf8":"data"}]}]}';
        await page.locator('#input').fill(format2);
        await page.locator('button:has-text("Process Transcript")').click();
        await page.waitForSelector('#output', { state: 'visible', timeout: 5000 });
        output = await page.locator('#output').inputValue();
        if (output === 'Test data') {
            console.log('✓ Format 2 works: "Test data"');
            passed++;
        } else {
            console.log(`✗ Format 2 failed. Got: "${output}"`);
            failed++;
        }
        await page.locator('button:has-text("Clear")').click();

        // Test Format 3: Handles newlines correctly
        console.log('\n--- Test Format 3: Newline replacement ---');
        const format3 = '{"events":[{"segs":[{"utf8":"Line1\\n"}]},{"segs":[{"utf8":"Line2"}]}]}';
        await page.locator('#input').fill(format3);
        await page.locator('button:has-text("Process Transcript")').click();
        await page.waitForSelector('#output', { state: 'visible', timeout: 5000 });
        output = await page.locator('#output').inputValue();
        if (output === 'Line1 Line2') {
            console.log('✓ Format 3 works (newlines replaced): "Line1 Line2"');
            passed++;
        } else {
            console.log(`✗ Format 3 failed. Got: "${output}"`);
            failed++;
        }
        await page.locator('button:has-text("Clear")').click();

        // Test Format 4: Real YouTube-like structure with extra fields
        console.log('\n--- Test Format 4: Real YouTube structure ---');
        const format4 = '{"events":[{"tStartMs":0,"dDurationMs":5000,"wWinId":1,"segs":[{"utf8":"[Music]"}]},{"tStartMs":5000,"dDurationMs":3000,"segs":[{"utf8":"Welcome"}]}]}';
        await page.locator('#input').fill(format4);
        await page.locator('button:has-text("Process Transcript")').click();
        await page.waitForSelector('#output', { state: 'visible', timeout: 5000 });
        output = await page.locator('#output').inputValue();
        if (output === '[Music]Welcome') {
            console.log('✓ Format 4 works: "[Music]Welcome"');
            passed++;
        } else {
            console.log(`✗ Format 4 failed. Got: "${output}"`);
            failed++;
        }

    } catch (err) {
        console.log(`\n✗ Test error: ${err.message}`);
        failed++;
    }

    console.log('\n========================================');
    console.log(`Format Tests: ${passed} passed, ${failed} failed`);
    console.log('========================================\n');

    await browser.close();
    server.close();

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
