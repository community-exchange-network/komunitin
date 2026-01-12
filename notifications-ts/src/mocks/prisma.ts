import { test } from 'node:test';

export const mockTable = (table: any, name: string = 'test', defaults?: (data: any) => any) => {
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
  };

  Object.assign(table, delegate);

  return store;
};
