import { defineConfig } from 'vitest/config'

// unit tests only; e2e/ is Playwright's
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
