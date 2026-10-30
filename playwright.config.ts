import { defineConfig } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: "bun src/server.ts",
    url: `http://127.0.0.1:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
