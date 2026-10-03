import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.E2E_OUTPUT_DIR || '../../.local/test-runs/web',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '../../docs/evidence/playwright-report', open: 'never' }]],
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5187', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_BROWSER_CHANNEL || undefined, viewport: { width: 1440, height: 1100 } } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5187',
    url: 'http://127.0.0.1:5187', reuseExistingServer: true, timeout: 120_000,
    env: { VITE_SOLANA_RPC_URL: 'http://127.0.0.1:8899', VITE_SOLANA_WS_URL: 'ws://127.0.0.1:8900', VITE_DEMO_MANIFEST_URL: '/deployments/localnet.json' },
  },
});
