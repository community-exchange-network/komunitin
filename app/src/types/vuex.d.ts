// Fix for Vuex 4 TypeScript module resolution issue
declare module 'vuex' {
  export * from 'vuex/types/index.d.ts'
}