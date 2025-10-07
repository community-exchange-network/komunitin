const esModules = ['quasar', 'quasar/lang', 'lodash-es', 'leaflet', 'markdown-to-txt', '@vue', 'uuid'].join('|');

export default {
  preset: 'ts-jest',
  globals: {
    __DEV__: true,
  },
  testEnvironment: 'jsdom',
  setupFiles: [
    '<rootDir>/test/jest/jest.env.ts',
  ],
  collectCoverage: false,
  coverageDirectory: '<rootDir>/test/jest/coverage',
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{ts,vue}',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '.d.ts$'],
  coverageReporters: [
    'html',
    'text',
    'text-summary',
  ],
  coverageThreshold: {
    global: {},
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/*.spec.js',
    '<rootDir>/src/**/__tests__/*.spec.ts',
    '<rootDir>/src/**/__tests__/*.test.ts',
    '<rootDir>/test/jest/__tests__/**/*.spec.ts',
    '<rootDir>/test/jest/__tests__/**/*.test.ts',
  ],
  moduleFileExtensions: [
    'js',
    'json',
    'jsx',
    'ts',
    'tsx',
    'vue',
    'mjs',
    'cjs'
  ],
  moduleNameMapper: {
    '^quasar$': 'quasar/dist/quasar.client.js',
    '^~/(.*)$': '<rootDir>/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^app/(.*)$': '<rootDir>/$1',
    '^components/(.*)$': '<rootDir>/src/components/$1',
    '^layouts/(.*)$': '<rootDir>/src/layouts/$1',
    '^pages/(.*)$': '<rootDir>/src/pages/$1',
    '^assets/(.*)$': '<rootDir>/src/assets/$1',
    '^boot/(.*)$': '<rootDir>/src/boot/$1',
    '.*css$': '<rootDir>/__mocks__/mock.css',
  },
  transform: {
    '.*\\.vue$': '@vue/vue3-jest',
    '.*\\.(js|mjs)$': 'babel-jest',
    '.+\\.(css|styl|less|sass|scss|svg|png|jpg|ttf|woff|woff2)$': 'jest-transform-stub',
    '^.+\\.tsx?$': 'ts-jest',
  },
  transformIgnorePatterns: [
    `node_modules/(?!(${esModules}))`
  ],

  moduleDirectories: [
    '<rootDir>/node_modules',
  ],
  testEnvironmentOptions: {
    customExportConditions: ["node", "node-addons"],
  },
  testTimeout: 30000
}
