import { defineConfig } from '@playwright/test'

// UI checks against ?demo data, so no Google account is needed (the laptop's emulator pass)
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/London', locale: 'en-GB' },
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
})
