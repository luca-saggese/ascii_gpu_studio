# Testing

Run `pnpm lint`, `pnpm test`, and `pnpm build`. `pnpm test:e2e` runs the Playwright Studio smoke check and requires a local Playwright Chromium installation (`pnpm exec playwright install chromium`).

Unit tests cover grid geometry, scene validation, `.ascii` round-trip, and traversal rejection. The E2E currently covers the responsive empty state. No browser GPU integration fixture or screenshot artifact has yet been produced; headless WebGL and performance results are therefore not claimed.
