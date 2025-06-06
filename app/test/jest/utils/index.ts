import { defineComponent } from 'vue';
import { flushPromises, mount, MountingOptions, VueWrapper } from "@vue/test-utils";

import store from 'src/store/index';
import createRouter from 'src/router/index';

import {Quasar, LocalStorage, Notify, Loading} from "quasar";
import * as quasar from "quasar"

// Boot files.
import bootErrors from '../../../src/boot/errors';
import bootI18n from '../../../src/boot/i18n';
import '../../../src/boot/mirage';
import bootAuth from '../../../src/boot/auth';
import { Auth } from '../../../src/plugins/Auth';
import { auth } from '../../../src/store/me';
import { mockToken } from 'src/server/AuthServer';
import { RouteLocationRaw } from 'vue-router';

// Mock window.scrollTo so it doesn't throw a "Not Implemented" error (by jsdom lib).
window.scrollTo = jest.fn();

// Mock navigator.geolocation
const mockGeolocation = {
  getCurrentPosition: jest.fn().mockImplementation(success =>
    Promise.resolve(
      success({
        coords: {
          latitude: 30,
          longitude: -105,
          speed: null,
          accuracy: 1,
          altitudeAccuracy: null,
          heading: null,
          altitude: null
        },
        timestamp: Date.now()
      })
    )
  )
};

Object.defineProperty(global.navigator, 'geolocation', {value: mockGeolocation});

// Mock Notification.
class MockNotification {
  public static requestPermission = jest.fn().mockImplementation((success) => Promise.resolve(success(false)));
  public static permission = "default";

  constructor(public title: string, public options?: NotificationOptions) {};
  public addEventListener = jest.fn();
}

Object.defineProperty(global, 'Notification', {value: MockNotification})
jest.mock("../../../src/plugins/Notifications");
jest.mock("firebase/messaging");

jest.mock("qrcode", () => ({
  toCanvas: jest.fn(),
  toDataURL: jest.fn().mockImplementation(() => Promise.resolve("data:image/png;base64,"))
}));
jest.mock("vue-qrcode-reader", () => ({
  QrcodeStream: jest.fn(),
}))
jest.mock("@vue-leaflet/vue-leaflet", () => ({
  LMap: jest.fn(),
  LTileLayer: jest.fn(),
  LMarker: jest.fn(),
}))


// Mock Web NFC api
class MockNDEFReader {
  constructor() {}
  public scan = jest.fn(() => new Promise(() => {}));
  public addEventListener = jest.fn();  
}
Object.defineProperty(global, "NDEFReader", {value: MockNDEFReader});

// Set a value on scrollHeight property so QInfiniteScrolling doesn't load all resources.
Object.defineProperty(HTMLDivElement.prototype, "scrollHeight", {configurable: true, value: 1500});
Object.defineProperty(SVGSVGElement.prototype, "pauseAnimations", {value: jest.fn()});
Object.defineProperty(SVGSVGElement.prototype, "unpauseAnimations", {value: jest.fn()});

// Get an object containing all Quasar Vue components.
const qComponents = Object.keys(quasar).reduce((object, key) => {
  const val = quasar[key as keyof typeof quasar] as any;
  if (val && val.name && val.name.startsWith("Q") && val.setup) {
    object[key] = val
  }
  return object
}, {} as any);

// Get an object containing all Quasar Vue directives.
const qDirectives = Object.keys(quasar).reduce((object, key) => {
  const val = quasar[key as keyof typeof quasar] as any;
  if (val && val.name && !val.name.startsWith("Q") && 
    ['created', 'beforeMount', 'mounted', 'beforeUpdate', 'updated', 'beforeUnmount', 'unmounted'].some(m => m in val)) {
    object[key] = val
  }
  return object
}, {} as any);


export const quasarPlugin = [Quasar, {
  plugins: [LocalStorage, Loading],
  components: qComponents,
  directives: qDirectives
}] as [typeof Quasar, any];

export async function mountComponent(component: ReturnType<typeof defineComponent>, options?: MountingOptions<any, any> & {login?: true}): Promise<VueWrapper> {
  LocalStorage.clear();

  // Login state. We must do that before createStore().
  if (options?.login) {
    // This call actually saves the mocked token in LocalStorage.
    auth.processTokenResponse(mockToken(Auth.SCOPES));
  }

  // Set the router mode to "history", as we have in our Quasar config file.
  process.env.VUE_ROUTER_MODE = "history";
  const router = createRouter({store});

  const mountOptions: any = {
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
  const redirect = (url:RouteLocationRaw) => {window.location.href = url.toString()};
  for (const boot of boots) {
    await boot({
      app, router, store, urlPath: "", publicPath: "", redirect
    });
  }

  // Mock $q.notify since it throws an errors in testing environment if we use the actual module.
  wrapper.vm.$q.notify = jest.fn();
  Notify.create = jest.fn();

  // Add more testing features to Vue.
  app.config.globalProperties.$nextTicks = async function() {
    await flushPromises();
    await this.$nextTick();
    await this.$nextTick();
    await this.$nextTick();
    await this.$nextTick();
  }

  app.config.globalProperties.$wait = async function(time?: number) {
    await this.$nextTicks();
    await new Promise((r) => setTimeout(r, time ?? 200));
  }

  return wrapper;
}

declare module "vue" {
  interface ComponentCustomProperties {
    /**
     * Sometimes the Vue.$nextTick() or Vue.$nextTicks() function is not enough for the content to be completely updated.
     * Known use cases:
     *  - Content needing to reach data from a mocked HTTP request.
     *  - Interact with router.back() feature.
     * This method waits for two ticks and then for 200 ms or the given time.
     */
    $wait(time?: number) : Promise<void>;

    /**
     * Sometimes the Vue.$nextTick() function is not enough, and you need to wait for more ticks.
     * 
     * Known use cases:
     *  - Wait for rendering the content after triggering an action that changes the current route.
     */
    $nextTicks(): Promise<void>;
  }
}

/**
 * Wait for the content of a function to be equal to the expected value, up to a timeout.
 */
export const waitFor = async (fn: () => any, expected: any = true, timeout = 1000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn() === expected) {
      expect(fn()).toBe(expected);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  expect(fn()).toBe(expected);
}
