
const originalDate = global.Date;

export const mockDate = (isoDate: string) => {
  const fixedDate = new originalDate(isoDate);
  global.Date = class extends originalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixedDate);
      } else {
        // @ts-ignore
        super(...args);
      }
    }
    static now() {
      return fixedDate.getTime();
    }
  } as any;
};

export const restoreDate = () => {
  global.Date = originalDate;
};
