// Load environment variables from file ".env.test"
import { config } from "dotenv"
import packageJson from "../../package.json"

config({ path: ".env.test" })
const flavor = process.env.FLAVOR || "komunitin"
config({ path: `.env.flavor.${flavor}` })

// Fine-tune some variables specifically for testing:
process.env.MOCK_ENVIRONMENT = "test"
process.env.APP_VERSION = packageJson.version


