const { defineConfig, devices } = require('@playwright/test');

const port = 8123;

module.exports = defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['github']] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'retain-on-failure',
        serviceWorkers: 'allow'
    },
    webServer: {
        command: 'node e2e/serve.cjs',
        url: `http://127.0.0.1:${port}/index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    },
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
        },
        {
            name: 'mobile',
            use: { ...devices['Pixel 5'] }
        }
    ]
});
