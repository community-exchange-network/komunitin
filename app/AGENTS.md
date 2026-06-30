# App Agent Instructions

## Scope

`app/` is the Komunitin Progressive Web App: Vue 3, Quasar v2, Vite, TypeScript, Vue Router, Vuex, vue-i18n, MirageJS, and PWA service worker code.

## Commands

```bash
pnpm install
cp .env.test .env
pnpm dev
pnpm build
pnpm lint
pnpm test
```

- Docker builds use Node.js 22 and pnpm.
- Standalone dev uses `.env.test` and mocked backend APIs. Use this environment for frontend-only development.
- To run against the root Docker stack, stop the `app` container, configure `.env` to point at the local services, and run `pnpm dev`.
- Local HTTPS dev requires `tmp/certs/localhost.pem`, `tmp/certs/localhost-key.pem`, and `LOCAL_CA_ROOT` as described in `DEVELOP.md`.

## Architecture

- Use `<script setup>` Composition API in Vue components.
- Keep route pages in `src/pages`, reusable components in `src/components`, layouts in `src/layouts`, boot files in `src/boot`, mock services in `src/server`, and Vuex modules in `src/store`.
- Use the composables `useResource` and `useResources` if possible for API interactions.
- Use `async`/`await` for asynchronous code.
- Expected application errors use `KError` and `KErrorCode` from `src/KError.ts`; recoverable errors go through the `$handleError` boot injection.
- Use `import type { ... }` for type-only imports.

## Flavors

- The app supports multiple flavors at build time. Current flavors are `komunitin` (default) and `ces` (Community Exchange System).
- Flavors override language strings, CSS variables, feature flags, assets.
- Frontend flavor selection uses the `FLAVOR` environment variable and `.env.flavor.<flavor>` files. Root Docker Compose passes `KOMUNITIN_FLAVOR` as the app build arg.

## UI, Styles

- Prefer Quasar components and utility classes. Check Quasar docs at https://quasar.dev/docs for available components and utilities.
- Use scoped SCSS only for behavior not covered by Quasar utilities.

## Language

- Read the terminology guidelines `src/i18n/README.md` and the flavor overrides (`src/i18n/flavors/ces/README.md`) before changing or adding any user-facing string.
- Keep translation keys static, for example `t('account')`, not `t(key)`.
- Languages live under `src/i18n/<lang>/`; flavor overrides live under `src/i18n/flavors/<flavor>/<lang>/`.

## Tests

- Tests use Vitest with jsdom. Config is in `vitest.config.ts`; setup and helpers are in `test/vitest/`.
- Prefer e2e-ish tests that mount the real app with `mountComponent(App)` and simulate user interaction. Use narrower unit tests for complex isolated logic.
- Use `waitFor(fn, expected, message?, timeout?)` from `test/vitest/utils/index.ts` for async assertions. Do not add arbitrary sleeps.
- Test files live in `src/**/__tests__/*.{spec,test}.ts` or `test/vitest/__tests__/**/*.{spec,test}.ts`.
- If Vitest fails because `.quasar/tsconfig.json` is missing, run `pnpm run build` first.
