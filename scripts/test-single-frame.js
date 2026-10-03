import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureKeyFrames() {
  console.log('Testing Chrome and capturing key scene frames...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--hide-scrollbars']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  await page.goto('http://localhost:5173/demo.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.assetsLoaded === true, { timeout: 15000 });
  await page.evaluate(() => document.body.classList.add('recording-mode'));
  console.log('Demo loaded successfully.');

  const times = [
    { t: 2.0, name: 'check-s1-solo.jpg' },
    { t: 5.0, name: 'check-s2-1v1.jpg' },
    { t: 8.5, name: 'check-s3-lobby.jpg' },
    { t: 12.0, name: 'check-s4-code.jpg' },
    { t: 15.0, name: 'check-s5-mobile.jpg' },
    { t: 18.0, name: 'check-s6-crash.jpg' },
    { t: 20.2, name: 'check-s7a-typing.jpg' },
    { t: 21.8, name: 'check-s7b-home.jpg' }
  ];

  for (const item of times) {
    await page.evaluate((time) => window.renderFrame(time), item.t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    const outPath = path.resolve(__dirname, `../public/${item.name}`);
    fs.writeFileSync(outPath, buf);
    console.log(`✓ Frame at t=${item.t}s saved to ${item.name}`);
  }

  await browser.close();
  console.log('All key frames captured!');
}

captureKeyFrames().catch(err => {
  console.error('Error capturing frames:', err);
  process.exit(1);
});
