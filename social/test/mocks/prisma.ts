import { test } from 'node:test'
import prisma from '../../src/utils/prisma'

const mockTable = (table: any, name: string = 'test', defaults?: (data: any) => any) => {
  const store: any[] = []

  const delegate = {
    create: test.mock.fn(async (args: any) => {
      const item = {
        id: `${name}-${Math.random().toString(36).substring(2, 15)}`,
        created: new Date(),
        updated: new Date(),
        ...defaults?.(args.data),
        ...args.data,
      }
      store.push(item)
      return item
    }),
    findMany: test.mock.fn(async (args: any) => {
      let results = [...store]
      if (args?.where) {
        for (const [key, value] of Object.entries(args.where)) {
          results = results.filter((n: any) => n[key] === value)
        }
      }
      if (args?.orderBy) {
        const [key, direction] = Object.entries(args.orderBy)[0] as [string, string]
        results.sort((a: any, b: any) => {
          if (a[key] < b[key]) return direction === 'asc' ? -1 : 1
          if (a[key] > b[key]) return direction === 'asc' ? 1 : -1
          return 0
        })
      }
      if (args?.take) {
        results = results.slice(0, args.take)
      }
      return results
    }),
    // Added helpers useful for tests: findFirst, upsert and delete
    findFirst: test.mock.fn(async (args: any) => {
      const results = await delegate.findMany({ where: args?.where })
      return results.length ? results[0] : null
    }),
    // Prisma read paths usually call findUnique for model IDs.
    findUnique: test.mock.fn(async (args: any) => {
      const results = await delegate.findMany({ where: args?.where })
      return results.length ? results[0] : null
    }),
    upsert: test.mock.fn(async (args: any) => {
      const { where, create, update } = args as any
      // Try to find by matching all where fields
      const existing = await delegate.findFirst({ where })
      if (existing) {
        Object.assign(existing, {
          ...update,
          updated: new Date()
        })
        return existing
      } else {
        return await delegate.create({ data: create })
      }
    }),
    update: test.mock.fn(async (args: any) => {
      const { where, data } = args as any
      const existing = await delegate.findFirst({ where })
      if (!existing) {
        throw new Error('Record not found')
      }
      Object.assign(existing, {
        ...data,
        updated: new Date()
      })
      return existing
    }),
    delete: test.mock.fn(async (args: any) => {
      const found = await delegate.findFirst({ where: args.where })
      if (found) {
        const index = store.findIndex(item => item.id === found.id)
        const [deleted] = store.splice(index, 1)
        return deleted
      }
      return null
    }),
    count: test.mock.fn(async (args: any) => {
      let results = [...store]
      if (args?.where) {
        for (const [key, value] of Object.entries(args.where)) {
          results = results.filter((n: any) => {
            if (value === null) {
              return n[key] === null || n[key] === undefined
            }
            return n[key] === value
          })
        }
      }
      return results.length
    }),
  }

  Object.assign(table, delegate)
  return store
}

let database: Record<string, any[]> | null = null

export const mockDb = () => {
  database = {
    user: mockTable(prisma.user, 'user'),
    // Add other tables as needed
  }
  return database
}

export const resetDb = () => {
  if (database) {
    for (const table of Object.values(database)) {
      table.length = 0
    }
  }
}