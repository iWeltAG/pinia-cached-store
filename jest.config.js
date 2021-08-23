/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  rootDir: __dirname,

  // Mocking
  clearMocks: true,

  // Coverage
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['node_modules/', 'src/index.ts'],
  coverageReporters: ['json', 'text', 'lcov'],

  // Environment and runtime
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  moduleNameMapper: {
    '^pinia-cached-store$': '<rootDir>/src',
  },
  transform: {
    '^.+\\.tsx?$': '@sucrase/jest-plugin',
  },
};
