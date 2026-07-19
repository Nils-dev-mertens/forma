module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js',
    '!**/test/utils/**'
  ],
  moduleFileExtensions: ['js', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/test/utils/setup.js'],
  coverageDirectory: '<rootDir>/test/coverage',
  coverageReporters: ['text', 'lcov'],
  // No module name mapper needed - we use the test helper
  transform: {}
};