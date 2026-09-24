export const slugify = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-') // Replace spaces and non-word characters with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading and trailing hyphens
}