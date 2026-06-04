const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: {
    timeout: 5000,
  },
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 960, height: 540 },
    video: 'on',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10000
  },
});
