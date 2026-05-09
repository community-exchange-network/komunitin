import type { FilterOptions, SortOptions } from './request'

export const whereFilter = (filter: FilterOptions) => {
  const where: Record<string, any> = {}

  for (const [key, rawValue] of Object.entries(filter)) {
    const values = Array.isArray(rawValue) ? rawValue : rawValue.split(',')
    const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0)

    if (cleaned.length === 0) {
      continue
    }

    if (cleaned.length > 1) {
      where[key] = { in: cleaned }
    } else {
      where[key] = cleaned[0]
    }
  }

  return where
}

export const orderBySort = (sort: SortOptions) => {
  return {
    [sort.field]: sort.order,
  }
}
