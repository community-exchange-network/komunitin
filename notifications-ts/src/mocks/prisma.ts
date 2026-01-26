import { test } from 'node:test';
import prisma from '../utils/prisma';

const mockTable = (table: any, name: string = 'test', defaults?: (data: any) => any) => {
  const store: any[] = [];

  const delegate = {
    create: test.mock.fn(async (args: any) => {
      const item = {
        id: `${name}-${Math.random().toString(36).substring(2, 15)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defaults?.(args.data),
        ...args.data,
      };
      store.push(item);
      return item;
    }),
    findMany: test.mock.fn(async (args: any) => {
      let results = [...store];
      if (args?.where) {
        for (const [key, value] of Object.entries(args.where)) {
          results = results.filter((n: any) => n[key] === value);
        }
      }
      if (args?.orderBy) {
        const [key, direction] = Object.entries(args.orderBy)[0] as [string, string];
        results.sort((a: any, b: any) => {
          if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
          if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
      if (args?.take) {
        results = results.slice(0, args.take);
      }
      return results;
    }),
    // Added helpers useful for tests: findFirst, upsert and delete
    findFirst: test.mock.fn(async (args: any) => {
      const results = await delegate.findMany({ where: args?.where });
      return results.length ? results[0] : null;
    }),
    upsert: test.mock.fn(async (args: any) => {
      const { where, create, update } = args as any;
      // Try to find by matching all where fields
      const existing = await delegate.findFirst({ where })
      if (existing) {
        Object.assign(existing, {
          ...update,
          updatedAt: new Date()
        });
        return existing;
      } else {
        return await delegate.create({ data: create });
      }
    }),
    update: test.mock.fn(async (args: any) => {
      const { where, data } = args as any;
      const existing = await delegate.findFirst({ where });
      if (!existing) {
        throw new Error('Record not found');
      }
      Object.assign(existing, {
        ...data,
        updatedAt: new Date()
      });
      return existing;
    }),
    delete: test.mock.fn(async (args: any) => {
      const found = await delegate.findFirst({ where: args.where });
      if (found) {
        const index = store.findIndex(item => item.id === found.id);
        const [deleted] = store.splice(index, 1);
        return deleted;
      }
      return null;
    }),
    groupBy: test.mock.fn(async (args: any) => {
      const all = await delegate.findMany({ where: args.where });
      const field = args.by[0];
      const groups = new Map();
      all.forEach((item: any) => {
        const key = item[field];
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(item);
      });
      // Implement _max aggregation only.
      if (args._max) {
        const aggField = Object.keys(args._max)[0];
        const items = groups.values().map((items: any[]) => {
          return items.reduce((max, item) => {
            return item[aggField] > max[aggField] ? item : max;
          });
        });
        return items.map(item => ({
          [field]: item[field],
          _max: { [aggField]: item[aggField] },
        }));
      } else {
        throw new Error('Only _max aggregation is implemented in mockTable.groupBy');
      }
    }),
  };

  Object.assign(table, delegate);

  return store;
};


export const mockDb = () => {
  return {
    newsletterLog: mockTable(prisma.newsletterLog, 'newsletterLog', (data) => ({
      sentAt: new Date(),
    })),
    appNotification: mockTable(prisma.appNotification, 'appNotification'),
    pushSubscription: mockTable(prisma.pushSubscription, 'pushSubscription'),
    pushNotification: mockTable(prisma.pushNotification, 'pushNotification'),
    // Add other tables as needed
  }
}