module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/test/utils/setup.js'],
  collectCoverageFrom: [
    'apps/**/src/**/*.ts',
    'packages/**/src/**/*.ts'
  ],
  coverageDirectory: '<rootDir>/test/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {},
  moduleNameMapper: {
    '^@repo/(.*)$': '<rootDir>/packages/$1/src'
  },
  roots: ['<rootDir>'],
};