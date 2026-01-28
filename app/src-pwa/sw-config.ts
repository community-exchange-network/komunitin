import localforage from 'localforage'
import { config, setConfig as loadConfig } from '../src/utils/config'

const CONFIG_STORAGE_KEY = 'app-config'
let configRestored = false

const restoreConfig = async () => {
  try {
    const storedConfig = await localforage.getItem<Record<string, string>>(CONFIG_STORAGE_KEY)
    if (storedConfig) {
      loadConfig(storedConfig)
      configRestored = true
    }
  } catch (err) {
    console.error("Failed to restore config", err)
  }
}

export const getConfig = async () => {
  if (!configRestored) {
    await restoreConfig()
  }
  return config
}

export const setConfig = async (config: Record<string, string>) => {
  loadConfig(config)
  configRestored = true
  try {
    await localforage.setItem(CONFIG_STORAGE_KEY, config)
  } catch (err) {
    console.error("Failed to persist config", err)
  }
}
