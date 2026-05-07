import { test } from 'node:test'
import prisma from '../../src/utils/prisma'

type MockClient = {
  user: any
  group: any
  groupAdminUser: any
  member: any
  category: any
  memberUser: any
  $extends: (extension: any) => MockClient
  $transaction: (...args: any[]) => Promise<any>
  tenantId?: string
  transaction: (...args: any[]) => Promise<any>
}

type MockScope = {
  tenantId?: string
  privileged?: boolean
}

type TableDelegateOptions = {
  tenantScoped?: boolean
  hydrateRelations?: (item: any, where?: Record<string, any>) => any
}

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value)
}

const matchesWhere = (item: any, where: Record<string, any>): boolean => {
  return Object.entries(where).every(([key, value]) => {
    const current = item?.[key]

    if (value === null) {
      return current === null || current === undefined
    }

    if (isPlainObject(value)) {
      return isPlainObject(current) && matchesWhere(current, value)
    }

    return current === value
  })
}

const isVisibleInScope = (item: any, scope: MockScope, tenantScoped: boolean) => {
  if (!tenantScoped || scope.privileged || !scope.tenantId) {
    return true
  }

  return item?.tenantId === scope.tenantId
}

const hydrateRelations = (item: any, where?: Record<string, any>) => {
  if (!where || !database) {
    return item
  }

  if ('member' in where && item?.memberId && item?.tenantId) {
    return {
      ...item,
      member: database.member.find(
        (member) => member.id === item.memberId && member.tenantId === item.tenantId,
      ),
    }
  }

  return item
}

const filterStore = (
  store: any[],
  scope: MockScope,
  where?: Record<string, any>,
  options: TableDelegateOptions = {},
) => {
  const tenantScoped = options.tenantScoped ?? true

  return store.filter((item) => {
    if (!isVisibleInScope(item, scope, tenantScoped)) {
      return false
    }

    if (!where) {
      return true
    }

    return matchesWhere(options.hydrateRelations?.(item, where) ?? item, where)
  })
}

const createTableDelegate = (
  store: any[],
  scope: MockScope,
  name: string = 'test',
  defaults?: (data: any) => any,
  options: TableDelegateOptions = {},
) => {
  const tenantScoped = options.tenantScoped ?? true

  const delegate = {
    create: test.mock.fn(async (args: any) => {
      const data = {
        ...(tenantScoped && scope.tenantId && !args.data?.tenantId ? { tenantId: scope.tenantId } : {}),
        ...args.data,
      }

      const item = {
        id: `${name}-${Math.random().toString(36).substring(2, 15)}`,
        created: new Date(),
        updated: new Date(),
        ...defaults?.(data),
        ...data,
      }
      store.push(item)
      return item
    }),
    findMany: test.mock.fn(async (args: any) => {
      let results = filterStore(store, scope, args?.where, options)
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
      const results = filterStore(store, scope, args?.where, options)
      return results.length
    }),
  }

  return delegate
}

let database: Record<string, any[]> | null = null

const hydrateMemberUserRelations = (item: any, where?: Record<string, any>) => {
  if (!database || !where || !('member' in where) || !item?.memberId || !item?.tenantId) {
    return item
  }

  return {
    ...item,
    member: database.member.find(
      (member) => member.id === item.memberId && member.tenantId === item.tenantId,
    ),
  }
}

const unwrapExtension = (extension: any) => {
  if (!isPlainObject(extension) && typeof extension === 'function') {
    return extension({
      $extends: (nextExtension: any) => nextExtension,
    })
  }

  return extension
}

const applyExtension = (extension: any) => {
  const unwrapped = unwrapExtension(extension)
  const client = unwrapped?.client as { tenantId?: string } | undefined

  if (typeof client?.tenantId === 'string') {
    return createScopedClient({ tenantId: client.tenantId })
  }

  if (unwrapped?.query?.$allOperations) {
    return createScopedClient({ privileged: true })
  }

  return createScopedClient({ privileged: true })
}

const createScopedClient = (scope: MockScope): MockClient => {
  if (!database) {
    throw new Error('Mock database is not initialized')
  }

  const client = {
    user: createTableDelegate(database.user, scope, 'user', undefined, { tenantScoped: false }),
    group: createTableDelegate(database.group, scope, 'group'),
    groupAdminUser: createTableDelegate(database.groupAdminUser, scope, 'groupAdminUser'),
    member: createTableDelegate(database.member, scope, 'member'),
    category: createTableDelegate(database.category, scope, 'category'),
    memberUser: createTableDelegate(database.memberUser, scope, 'memberUser', undefined, {
      hydrateRelations: hydrateMemberUserRelations,
    }),
  }

  const transaction = async (...args: any[]) => {
    const [arg] = args

    if (Array.isArray(arg)) {
      return Promise.all(arg)
    }

    return arg(client)
  }

  return {
    ...client,
    $extends: (extension: any) => applyExtension(extension),
    tenantId: scope.tenantId,
    transaction,
    $transaction: transaction,
  } as MockClient
}

export const mockDb = () => {
  database = {
    user: [],
    group: [],
    groupAdminUser: [],
    member: [],
    category: [],
    memberUser: [],
    // Add other tables as needed
  }

  const privilegedClient = createScopedClient({ privileged: true })
  Object.assign(prisma.user, privilegedClient.user)
  Object.assign(prisma.group, privilegedClient.group)
  Object.assign(prisma.groupAdminUser, privilegedClient.groupAdminUser)
  Object.assign(prisma.member, privilegedClient.member)
  Object.assign(prisma.category, privilegedClient.category)
  Object.assign(prisma.memberUser, privilegedClient.memberUser)
  Object.assign(prisma, {
    $extends: privilegedClient.$extends,
    $transaction: privilegedClient.$transaction,
    transaction: privilegedClient.transaction,
    tenantId: privilegedClient.tenantId,
  })

  return database
}

export const resetDb = () => {
  if (database) {
    for (const table of Object.values(database)) {
      table.length = 0
    }
  }
}