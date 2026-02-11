// Load environment variables from file ".env.test"
import { config } from "dotenv"
import packageJson from "../../package.json"
import { vi } from "vitest"

config({ path: ".env.test" })
const flavor = process.env.FLAVOR || "komunitin"
config({ path: `.env.flavor.${flavor}` })

// Fine-tune some variables specifically for testing:
process.env.MOCK_ENVIRONMENT = "test"
process.env.APP_VERSION = packageJson.version

// Mock localforage to prevent "ReferenceError: localStorage is not defined"
vi.mock("localforage", () => {
  const createStore = () => {
    const store = new Map()
    return {
      getItem: vi.fn(async (key) => {
        const value = store.get(key)
        return value === undefined ? null : value
      }),
      setItem: vi.fn(async (key, value) => { store.set(key, value); return value }),
      removeItem: vi.fn(async (key) => { store.delete(key) }),
      clear: vi.fn(async () => store.clear()),
      iterate: vi.fn(async (callback) => {
        let i = 0
        for (const [key, value] of store.entries()) {
          await callback(value, key, i++)
        }
      }),
      createInstance: vi.fn(() => createStore())
    }
  }

  const instance = createStore()
  return {
    default: instance
  }
})

// Mock window.scrollTo so it doesn't throw a "Not Implemented" error (by jsdom lib).
window.scrollTo = vi.fn();

// Mock navigator.geolocation
const mockGeolocation = {
  getCurrentPosition: vi.fn().mockImplementation(success =>
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

Object.defineProperty(globalThis.navigator, 'geolocation', { value: mockGeolocation, configurable: true });

// Mock Notification.
class MockNotification {
  public static requestPermission = vi.fn(() => Promise.resolve("denied"));
  public static permission = "default";

  constructor(public title: string, public options?: NotificationOptions) { };
  public addEventListener = vi.fn();
}

Object.defineProperty(globalThis, 'Notification', { value: MockNotification, configurable: true })

vi.mock("qrcode", () => {
  const toDataURL = vi.fn().mockImplementation(() => Promise.resolve("data:image/png;base64,"))
  return {
    default: { toCanvas: vi.fn(), toDataURL },
    toCanvas: vi.fn(),
    toDataURL
  }
});

vi.mock("vue-qrcode-reader", () => ({
  QrcodeStream: vi.fn(),
}))

vi.mock("@vue-leaflet/vue-leaflet", () => ({
  LMap: vi.fn(),
  LTileLayer: vi.fn(),
  LMarker: vi.fn(),
}))

// Mock Web NFC api
class MockNDEFReader {
  constructor() { }
  public scan = vi.fn(() => new Promise(() => { }));
  public addEventListener = vi.fn();
}
Object.defineProperty(globalThis, "NDEFReader", { value: MockNDEFReader, configurable: true });

// Set a value on scrollHeight property so QInfiniteScrolling doesn't load all resources.
Object.defineProperty(HTMLDivElement.prototype, "scrollHeight", { configurable: true, value: 1500 });
Object.defineProperty(SVGSVGElement.prototype, "pauseAnimations", { value: vi.fn(), configurable: true });
Object.defineProperty(SVGSVGElement.prototype, "unpauseAnimations", { value: vi.fn(), configurable: true });




