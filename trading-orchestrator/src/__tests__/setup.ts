/**
 * Jest Test Setup
 *
 * Global setup for all Sidex tests
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console.log/error to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Silence console output during tests unless DEBUG=true
  if (process.env.DEBUG !== 'true') {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterAll(() => {
  // Restore console
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const randomString = (length: number = 8) =>
  Math.random().toString(36).substring(2, 2 + length);

export const randomNumber = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
