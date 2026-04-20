import { existsSync, readFileSync } from "fs"


const readSassVariables = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {}
  }

  const sassVariables: Record<string, string> = {}
  const fileContent = readFileSync(filePath, "utf8")

  for (const line of fileContent.split(/\r?\n/)) {
    const cleanLine = line.split("//", 1)[0]?.trim() ?? ""
    const match = cleanLine.match(/^\$([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/)

    if (!match) {
      continue
    }

    const [, variableName, variableValue] = match
    sassVariables[variableName] = variableValue
  }

  return sassVariables
}

export const getThemeColor = (flavor: string): string => {
  const defaultSassVariables = readSassVariables("src/css/quasar.variables.sass")
  const flavorSassVariables = readSassVariables(`src/css/flavors/${flavor}/override.variables.sass`)
  return flavorSassVariables["primary"] || defaultSassVariables["primary"] || "#000000"
}

export const getBackgroundColor = (flavor: string): string => {
  const defaultSassVariables = readSassVariables("src/css/quasar.variables.sass")
  const flavorSassVariables = readSassVariables(`src/css/flavors/${flavor}/override.variables.sass`)
  return flavorSassVariables["background"] || defaultSassVariables["background"] || "#ffffff"
}