// Run the browser suite against the live site:
//   PLAYWRIGHT_BASE_URL=https://sim.steeledev.org npx playwright test -c playwright.live.config.js
// Starts fresh games, so only run it when nobody is playing.
import fs from 'node:fs'
import base from './playwright.config.js'

const chrome = process.env.PW_CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'
const proxy  = process.env.HTTPS_PROXY || process.env.https_proxy

export default {
  ...base,
  use: {
    ...base.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://sim.steeledev.org',
    ...(fs.existsSync(chrome) ? { launchOptions: { executablePath: chrome } } : {}),
    ...(proxy ? { proxy: { server: proxy }, ignoreHTTPSErrors: true } : {}),
  },
}
