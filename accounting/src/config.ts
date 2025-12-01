import dotenv from "dotenv"
import { badConfig } from "./utils/error"
import { Config } from "@stellar/stellar-sdk"

const loadConfig = () => {
  // Read .env file
  dotenv.config()

  // Build configuration object
  const config = {
    STELLAR_NETWORK: (process.env.STELLAR_NETWORK || "testnet") as "testnet" | "local" | "public",
    STELLAR_HORIZON_URL: process.env.STELLAR_HORIZON_URL ||  "https://horizon-testnet.stellar.org",
    STELLAR_FRIENDBOT_URL: process.env.STELLAR_FRIENDBOT_URL || "https://friendbot.stellar.org",
    STELLAR_CHANNEL_ACCOUNTS_ENABLED: process.env.STELLAR_CHANNEL_ACCOUNTS_ENABLED === "true" || false,
    DOMAIN: process.env.DOMAIN || "komunitin.org",
    MASTER_PASSWORD_SALT: process.env.MASTER_PASSWORD_SALT || undefined,
    AUTH_JWKS_URL: process.env.AUTH_JWKS_URL || "https://komunitin.org/.well-known/jwks.json",
    AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER || "https://komunitin.org",
    AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE?.split(',') || ['komunitin-app', 'komunitin-notifications'],
    API_BASE_URL: process.env.API_BASE_URL || "https://accounting.komunitin.org",
    NOTIFICATIONS_API_URL: process.env.NOTIFICATIONS_API_URL || "https://notifications.komunitin.org",
    NOTIFICATIONS_API_USERNAME: process.env.NOTIFICATIONS_API_USERNAME || "accounting",
    DOCKER: process.env.DOCKER === "true" || false,
    APP_URL: process.env.APP_URL || "https://komunitin.org",
    WEBHOOKS_BASE_URL: process.env.WEBHOOKS_BASE_URL || process.env.API_BASE_URL || "https://accounting.komunitin.org",
    
    // SECRETS
    // TODO: Using environment variables for secrets is a reasonable practice but not a 
    // best practice. Consider other mechanisms for providing secrets to the application.
    SPONSOR_PRIVATE_KEY: process.env.SPONSOR_PRIVATE_KEY || undefined,
    MASTER_PASSWORD: process.env.MASTER_PASSWORD || undefined,
    NEW_MASTER_PASSWORD: process.env.NEW_MASTER_PASSWORD || undefined,
    NOTIFICATIONS_API_PASSWORD: process.env.NOTIFICATIONS_API_PASSWORD || undefined,
    MOLLIE_API_KEY: process.env.MOLLIE_API_KEY || undefined,
  }
  // Remove secrets from the process.env so other libraries don't use/leak them.
  delete process.env.SPONSOR_PRIVATE_KEY
  delete process.env.MASTER_ENCRYPTION_KEY
  delete process.env.NEW_MASTER_ENCRYPTION_KEY
  delete process.env.NOTIFICATIONS_API_PASSWORD
  delete process.env.MOLLIE_API_KEY

  // Validate some config
  if (!["testnet", "local", "public"].includes(config.STELLAR_NETWORK)) {
    throw badConfig("Invalid STELLAR_NETWORK config")
  }
  // Allow plain http connections to Stellar Horizon server in local network.
  if (config.STELLAR_NETWORK === "local") {
    Config.setAllowHttp(config.STELLAR_HORIZON_URL.startsWith("http://"))
  }
  return config
}

export const config = loadConfig()

export const setConfig = (newConfig: Partial<typeof config>) => {
  Object.assign(config, newConfig)
}
