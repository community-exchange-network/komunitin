import { existsSync, readFileSync } from "fs"


const readSassVariables = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {}
  }

  const sassVariables: Record<string, string> = {}
  const fileContent = readFileSync(filePath, "utf8")

  for (const line of fileContent.split(/\r?\n/)) {
    const cleanLine = (line.split("//", 1)[0]?.trim() ?? "").replace(/;$/, "")
    const match = cleanLine.match(/^\$([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/)

    if (!match) {
      continue
    }

    const [, variableName, variableValue] = match
    sassVariables[variableName] = variableValue
  }

  return sassVariables
}

export const getThemeColors = (flavor: string): { primary: string | undefined, background: string | undefined } => {
  const defaultSassVariables = readSassVariables("src/css/quasar.variables.scss")
  const flavorSassVariables = readSassVariables(`src/css/flavors/${flavor}/override.variables.scss`)

  const variables = { ...defaultSassVariables, ...flavorSassVariables }
  // Theme colors can refer to palette tokens in the SCSS theme.
  const getVariable = (name: string): string | undefined => {
    const value = variables[name]
    return value?.startsWith("$") ? getVariable(value.slice(1)) : value
  }
  
  return {
    primary: getVariable("primary"),
    background: getVariable("background"),
  } 
}