# Vitest Migration Summary

## Overview

The test runner has been successfully migrated from Jest to Vitest. All test files ending with `.spec.ts` are now executed under Vitest.

## Running Tests

```bash
# Run all tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Current Test Status

- **Total Test Files**: 20
- **Passing**: 12 files (45 tests)
- **Failing**: 8 files (11 tests)

### Passing Test Files ✅

1. `test/vitest/__tests__/Pass.spec.ts`
2. `src/components/__tests__/Avatar.spec.ts`
3. `src/components/__tests__/SimpleMap.spec.ts`
4. `src/components/__tests__/SocialNetworkList.spec.ts`
5. `src/pages/__tests__/Error404.spec.ts`
6. `src/pages/members/__tests__/AccountLimits.spec.ts`
7. `src/server/__tests__/Server.spec.ts`
8. `test/vitest/__tests__/Home.spec.ts`
9. `test/vitest/__tests__/Groups.spec.ts`
10. `test/vitest/__tests__/Needs.spec.ts`
11. `test/vitest/__tests__/Members.spec.ts`
12. `test/vitest/__tests__/LoggedIn.spec.ts`

### Known Issues ⚠️

The following test files have failures. Most of these were pre-existing issues from the Jest setup:

1. **SelectLang.spec.ts** (1 test)
   - Language change timing issue
   
2. **PageHeader.spec.ts** (multiple errors)
   - Firebase messaging mock needs improvement
   - Unhandled errors from NotificationsBanner component
   
3. **Explore.spec.ts** (1 test)
   - Navigation element not found
   
4. **Login.spec.ts** (3 tests)
   - DOM element issues during login flow
   
5. **Member.spec.ts** (1 test)
   - Wrong navigation path assertion
   
6. **Offers.spec.ts** (1 test)
   - Flaky date test: "Updated yesterday" (same issue as in Jest)
   - The test expects "Updated yesterday" but gets "Updated today"
   
7. **Signup.spec.ts**
   - Mock setup needs verification
   
8. **Transactions.spec.ts** (2 tests)
   - Navigation path issues
   - QR generation test failure

## Configuration

### Main Config: `vitest.config.ts`

- Uses `@quasar/vite-plugin` for Quasar integration
- Uses `vite-tsconfig-paths` for path resolution
- Environment: `jsdom`
- Test timeout: 30 seconds
- Globals: enabled

### Setup File: `test/vitest/vitest.setup.ts`

Loads environment variables and sets up the mock environment.

### Test Utilities: `test/vitest/utils/`

- `index.ts` - Main utilities including `mountComponent()` and `waitFor()`
- `quasar-plugin.ts` - Quasar plugin configuration

## Test Patterns

### Component Tests

Located in `src/*/*/tests__/*.spec.ts`. Use `installQuasarPlugin()` from `@quasar/quasar-app-extension-testing-unit-vitest` for Quasar components.

Example:
```typescript
import { installQuasarPlugin } from '@quasar/quasar-app-extension-testing-unit-vitest';
import { mount } from "@vue/test-utils";
import { describe, expect, it } from 'vitest';
import MyComponent from "../MyComponent.vue";

installQuasarPlugin();

describe("MyComponent", () => {
  it("renders correctly", () => {
    const wrapper = mount(MyComponent, { props: { foo: "bar" } });
    expect(wrapper.text()).toContain("bar");
  });
});
```

### Integration Tests

Located in `test/vitest/__tests__/*.spec.ts`. Use `mountComponent()` helper for full app mounting with routing, store, and boot files.

Example:
```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mountComponent } from "../utils";
import App from "../../../src/App.vue";

describe("My Integration Test", () => {
  let wrapper;
  
  beforeAll(async () => {
    wrapper = await mountComponent(App, { login: true });
  });
  
  afterAll(() => wrapper.unmount());
  
  it("does something", async () => {
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/home");
  });
});
```

## Improvements over Jest

1. **Faster execution**: Vitest runs significantly faster than Jest
2. **Native ESM support**: No Babel configuration needed
3. **Better watch mode**: Smart re-running of affected tests
4. **Integrated UI**: Visual test interface with `npm run test:ui`
5. **Simpler mocking**: `vi` from vitest is more intuitive than jest mocks
6. **Better TypeScript support**: Native support without ts-jest

## Dependencies

### Added
- `vitest@^3.2.4`
- `@vitest/ui@^3.2.4`
- `@vitest/browser@^3.2.4`
- `@vitejs/plugin-vue`
- `@quasar/vite-plugin`
- `@quasar/quasar-app-extension-testing-unit-vitest`
- `vite-tsconfig-paths`
- `jsdom`
- `happy-dom`

### Removed
- `jest`
- `@types/jest`
- `jest-environment-jsdom`
- `jest-transform-stub`
- `ts-jest`
- `@vue/vue3-jest`
- `@babel/core`
- `@babel/preset-env`

## Files Removed

- `jest.config.js`
- `babel.config.js`
- `test/jest/` directory (all contents)

## Future Improvements

1. **Fix Firebase mocking**: Improve the mock setup for firebase/messaging to eliminate unhandled errors
2. **Fix flaky tests**: Address date-based tests and timing issues
3. **Improve test coverage**: Add missing test cases
4. **Optimize test performance**: Use `@vitest/browser` for faster component tests if needed
5. **Add coverage reporting**: Configure coverage thresholds and reporting

## Notes

- The same test infrastructure works for both component and integration tests
- Tests are automatically discovered by pattern matching `*.spec.ts` files
- Use `globals: true` in config means no need to import `describe`, `it`, `expect` in every file (but we still import them for explicit clarity)
- Mock functions use `vi.fn()` instead of `jest.fn()`
- Dynamic imports use `vi.importActual()` instead of `jest.requireActual()`
