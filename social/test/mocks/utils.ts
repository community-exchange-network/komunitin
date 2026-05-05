export const uuid = (c: string) => [8,4,4,4,12].map(len => c.slice(0,1).repeat(len)).join('-')
