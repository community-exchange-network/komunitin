// Load environment variables from file ".env.test"
import { config } from "dotenv"
import packageJson from "../../package.json"
config({ path: ".env.test" })

// Fine-tune some variables specifically for jest testing:
process.env.MOCK_ENVIRONMENT = "test"
process.env.APP_VERSION = packageJson.version

