import { vi } from 'vitest';
import { type defineComponent } from 'vue';
import { flushPromises, mount, type MountingOptions, type VueWrapper } from "@vue/test-utils";
import { Notify, LocalStorage } from "quasar";
import { quasarPlugin, qComponents } from "./quasar-plugin";
import store from 'src/store/index';
import createRouter from 'src/router/index';


// Boot files.
import bootErrors from '../../../src/boot/errors';
import bootI18n from '../../../src/boot/i18n';
import '../../../src/boot/mirage';
import bootAuth from '../../../src/boot/auth';
import { Auth } from '../../../src/plugins/Auth';
import { auth } from '../../../src/store/me';
import { mockToken } from 'src/server/AuthServer';
import { type RouteLocationRaw } from 'vue-router';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mountComponent(component: ReturnType<typeof defineComponent>, options?: MountingOptions<any, any> & { login?: true }): Promise<VueWrapper> {
  LocalStorage.clear();

  // Login state. We must do that before createStore().
  if (options?.login) {
    // This call actually saves the mocked token in LocalStorage.
    auth.processTokenResponse(mockToken(Auth.SCOPES));
  }

  // Set the router mode to "history", as we have in our Quasar config file.
  process.env.VUE_ROUTER_MODE = "history";
  const router = createRouter();

  const mountOptions = {
    global: {
      plugins: [store, router, quasarPlugin],
      stubs: {
        // stub map components since they throw errors in test environment.
        LMap: true,
        LTileLayer: true,
        LMarker: true,
        // stub camera component
        QrcodeStream: true,
      },
    },
    attachTo: document.body,
    components: qComponents,
    ...options,
  };

  const wrapper = mount(component, mountOptions)
  const app = wrapper["__app"];

  // Call boot files.
  const boots = [bootErrors, bootI18n, bootAuth]
  const redirect = (url: RouteLocationRaw) => { window.location.href = url.toString() };
  for (const boot of boots) {
    await boot({
      app, router, urlPath: "", publicPath: "", redirect
    });
  }

  // Mock $q.notify since it throws an errors in testing environment if we use the actual module.
  wrapper.vm.$q.notify = vi.fn();
  Notify.create = vi.fn();

  return wrapper;
}

/**
 * Wait for the content of a function to be equal to the expected value, up to a timeout.
 * 
 * 1. First checks if the condition already holds synchronously.
 * 2. Then tries flushing promises (microtasks) to see if the condition resolves.
 * 3. Falls back to polling every 50ms until timeout.
 * 
 * @param fn - Function that returns the current value to check.
 * @param expected - The expected value (default: true).
 * @param message - Optional assertion message. Automatically generated if not provided.
 * @param timeout - Maximum time to wait in ms (default: 2000).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const waitFor = async (fn: () => any, expected: any = true, message?: string, timeout = 2000) => {
  const assertionMessage = message ?? (typeof expected === "boolean" ? `Expected condition to be ${expected}` : undefined);
  // 1. Check synchronously.
  let result = fn();
  if (result === expected) {
    expect(result).toBe(expected);
    return;
  }
  // 2. Try flushing promises.
  await flushPromises();
  result = fn();
  if (result === expected) {
    expect(result).toBe(expected);
    return;
  }
  // 3. Poll with timeout.
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 50));
    result = fn();
    if (result === expected) {
      expect(result).toBe(expected);
      return;
    }
  }
  // Final assertion with message.
  expect(fn(), assertionMessage).toBe(expected);
}
