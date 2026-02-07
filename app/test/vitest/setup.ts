// Load environment variables from file ".env.test"
import { config } from "dotenv"
import packageJson from "../../package.json"
import { vi } from "vitest"

config({ path: ".env.test" })
const flavor = process.env.FLAVOR || "komunitin"
config({ path: `.env.flavor.${flavor}` })

// Fine-tune some variables specifically for vitest testing:
process.env.MOCK_ENVIRONMENT = "test"
process.env.APP_VERSION = packageJson.version

// Global mocks that need to be registered before any module loads.
vi.mock("firebase/messaging", () => ({
  onMessage: vi.fn(),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  isSupported: vi.fn().mockResolvedValue(false),
}));
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));
