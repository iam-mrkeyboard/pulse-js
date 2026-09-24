import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'bench.html');

console.log('Launching Chrome…');
const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('Running benches…');
const results = await page.evaluate(async () => await window.__BENCH__());
await browser.close();
writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
