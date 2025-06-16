/**
 * Test setup file
 */

import { vi } from 'vitest';

// Mock Tauri APIs globally
global.vi = vi;

// Mock window.__TAURI__ if needed
Object.defineProperty(window, '__TAURI__', {
  value: {
    invoke: vi.fn(),
    convertFileSrc: vi.fn((src) => src)
  }
});

// Suppress console warnings in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn()
};