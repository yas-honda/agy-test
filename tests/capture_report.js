const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Adjust viewport for vertical report length
  await page.setViewportSize({ width: 1200, height: 1800 });
  
  const filePath = 'file://' + path.resolve(__dirname, '../architecture_report.html');
  console.log('Loading file:', filePath);
  
  await page.goto(filePath);
  
  // Wait for Mermaid engine to render diagrams inside the container
  await page.waitForSelector('.mermaid svg', { timeout: 10000 });
  
  // Brief stabilization pause for engine animations
  await page.waitForTimeout(1500);
  
  const screenshotPath = '/home/codespace/.gemini/antigravity-cli/brain/6b1de412-3d4b-415e-b124-610911416483/architecture_report.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  console.log('Report screenshot saved at:', screenshotPath);
  
  await browser.close();
})();
