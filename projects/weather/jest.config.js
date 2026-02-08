module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect'],

  // Add multiple paths for testing.
  testPathPatterns: ["./tests/server/index.test.js", "./tests/ui/App.test.tsx"]
};