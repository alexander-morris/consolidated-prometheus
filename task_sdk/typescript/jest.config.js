// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'], // Look for tests in the tests directory
  moduleNameMapper: {
    // If you have path aliases in tsconfig, map them here too
    // Example: '@src/(.*)': '<rootDir>/src/$1'
  },
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
}; 