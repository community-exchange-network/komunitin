import { group } from 'node:console';
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
