# STOCK- Inventory MVP

This repository contains a Vite + React dashboard for inventory visibility and an optional Fastify API server that powers live forecasts and integrations.

## Continuous Integration badge

After merging the CI workflow into your default branch, add the following markdown snippet to the top of `README.md` (replace `<OWNER>` and `<REPO>` with your GitHub namespace) to display the build status badge:

```md
![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)
```

The badge automatically reflects the result of the latest pull request checks targeting `main` or any `feat/*` branch.

## 1. Install dependencies

```bash
npm install
cd server && npm install
```

## 2. Configure environment variables

Pick the template that matches your target environment and copy it to `.env.local` (Vite) and `.env`/`.env.production` (Node) as needed:

- `.env.development.example` &rarr; local development
- `.env.staging.example` &rarr; staging/QA deployments
- `.env.production.example` &rarr; production deployments

Update the placeholders after copying. The table below summarises the intended defaults per environment.

| Key | Description | Development (`.env.development`) | Staging (`.env.staging`) | Production (`.env.production`) |
| --- | --- | --- | --- | --- |
| `VITE_API_URL` | Base URL (protocol + host) for the Fastify API. Leave unset to reuse the dashboard origin. | `http://localhost:8787` | `https://staging-api.stockwise.example.com` | `https://api.stockwise.example.com` |
| `VITE_FEATURE_LOCAL_MODE` | Enables the mock service worker and local data helpers. | `true` | `false` | `false` |
| `VITE_USE_SERVER` | Switches the dashboard between mock data (`false`) and live server sync (`true`). | `false` | `true` | `true` |
| `VITE_SLACK_WEBHOOK_URL` | Optional webhook used by the client event connectors. Leave blank to disable. | _(blank)_ | `https://hooks.slack.com/services/T00000000/B00000000/STAGINGTOKEN` | `https://hooks.slack.com/services/T00000000/B00000000/PRODUCTIONTOKEN` |
| `VITE_WEBHOOK_URL` | Optional generic webhook endpoint used for JSON event payloads. Leave blank to disable. | _(blank)_ | `https://staging-hooks.stockwise.example.com/integrations` | `https://hooks.stockwise.example.com/integrations` |
| `SLACK_WEBHOOK_URL` | Optional webhook consumed by custom server-side Slack notifications. The dashboard does not provide a built-in test endpoint. | _(blank)_ | `https://hooks.slack.com/services/T00000000/B00000000/STAGINGTOKEN` | `https://hooks.slack.com/services/T00000000/B00000000/PRODUCTIONTOKEN` |
| `OPENAI_API_KEY` | Secret used by the Fastify server to call the LLM-backed policy recommendation endpoint. Required for `/api/policies/recommendation`. | _(blank)_ | _(set via environment secret)_ | _(set via environment secret)_ |
> When `VITE_USE_SERVER` is set to `true`, ensure the API server is running and reachable at `VITE_API_URL` (or the dashboard origin when the variable is omitted). Production builds automatically hide the 로컬 모드 안내 배너 to avoid confusing operators.

## 3. Run the Fastify server (optional but required for live data)

```bash
cd server
npm run dev
```

The server listens on `http://localhost:8787` by default. Check the health endpoint to confirm it is up:

```bash
curl http://localhost:8787/health
```

## Product management API
- `GET /api/products?q=` supports SKU/name/category partial search and powers the 품목관리 table.
- `POST/PUT/DELETE /api/products` expect payloads with `packCase`, ABC/XYZ grades, buffer ratio, and daily demand stats.
- The server seeds sample SKUs on startup; call `__resetProductStore(false)` in tests to start clean.
- Frontend forms default unit to `EA`, buffer ratio 20%, and convert pack/case strings into numeric order quantities.

## 4. Run the web dashboard

In a separate terminal from the repository root:

```bash
npm run dev
```

Vite serves the dashboard at `http://localhost:5173`. When the server mode is enabled you will see live "발주 권장수량" and "결품 예상일" forecast cards on the dashboard.

> `npm run dev -- --host` exposes the dev server to your local network so teammates on the **same Wi-Fi/LAN** can load it via the printed IP address. It does **not** make the site public on the wider internet; for external sharing use the GitHub Pages workflow or another hosted deployment described below. Alternatively, install [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and run `cloudflared tunnel --url http://localhost:5173` to mint a temporary public URL that proxies requests into your local dev server.

## Local mock mode quickstart
1. Set `VITE_FEATURE_LOCAL_MODE=true` in your `.env.local` file to enable the browser mocks.
2. Leave `VITE_API_URL` unset so requests resolve against the service worker without hitting a server.
3. Run `npm run dev` from the project root; Vite will serve the dashboard and register the worker.
4. Open `http://localhost:5173` in the browser and watch the console for the "[MSW] Mocking enabled" banner.
5. Navigate to 판매, 패키지, 재고, 문서, 리포트 화면 to load the mocked collections.
6. Append `?error=1` to an endpoint URL in the Network tab to simulate 500 errors with a 10% chance.
7. Refresh the affected request until you observe the injected error response payload.
8. Remove the query parameter to restore the default successful mock responses.
9. Set `VITE_FEATURE_LOCAL_MODE=false` (or remove it) when you want to reconnect to a real backend.
10. Restart the dev server after toggling the flag to pick up the updated environment variables.

## GitHub Pages deployment

The repository ships with an automated GitHub Actions workflow that builds the Vite dashboard and publishes the `dist` output to
GitHub Pages. Follow the steps below to share the app through a public URL:

1. Open **Settings → Pages** in your GitHub repository and ensure the deployment source is set to **GitHub Actions**.
2. (Optional) Add repository secrets such as `VITE_API_URL`, `VITE_USE_SERVER`, or webhook URLs if you want the published
   dashboard to communicate with a live backend. The workflow injects these variables during the build step.
3. Push to `main` (or trigger the `Deploy dashboard to GitHub Pages` workflow manually). The workflow runs `npm ci` and
   `npm run build` before uploading the static assets to Pages.
4. Wait for the `deploy` job to finish; the workflow output lists the published URL (for example,
   `https://<owner>.github.io/<repository>/`).
5. Share the URL with your teammates. The workflow sets the Vite `base` path automatically so assets resolve correctly when the
   site is served from the repository subdirectory.

> The workflow keeps previous deployments available until a newer run finishes, so you can rely on the Pages URL as the
> canonical link to the dashboard.

## Verification checklist

- [ ] `.env.local` is populated with the correct API URL and server toggle.
- [ ] `npm run dev` inside `/server` starts without errors and `GET /health` returns `{ "status": "ok" }`.
- [ ] `npm run dev` in the project root serves the dashboard at `http://localhost:5173`.
- [ ] Dashboard displays the forecast cards with realistic values (server mode) or fallback calculations (mock mode).
- [ ] (Optional) Slack 알림을 사용한다면 설정 페이지에서 웹훅 URL과 활성화 토글이 저장되어 있습니다.

## Troubleshooting "Internal Server Error"

The Fastify API returns a generic 500 response (`{ "message": "Internal server error" }`) when a request triggers an unexpected
exception that is not covered by validation or Prisma-specific handlers. The server logs the original error (see
`server/src/app.ts`) so you can inspect the terminal output for stack traces and Prisma error codes. Typical root causes include:

- Missing environment configuration that prevents Prisma from connecting to the database.
- Logic bugs in route handlers that throw runtime errors before a response is sent.
- Database constraint violations other than `P2002` (duplicate) and `P2025` (not found), which are handled separately.

When you encounter the 500 response, check the server console for the logged `Unhandled error` entry; it contains the full
exception details needed to fix the underlying issue.
