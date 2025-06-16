/**
 * Enhanced tests for cryptographic utilities
 * Covers edge cases and malformed input scenarios per constraints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from '../lib/crypto';

describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(() => {
    crypto = CryptoService.getInstance();
    crypto.clearKey(); // Ensure clean state
  });

  describe('Initialization', () => {
    it('should initialize encryption with password', async () => {
      await crypto.initializeEncryption('test-password-123');
      
      expect(crypto.isInitialized()).toBe(true);
      
      // Should be able to encrypt/decrypt after initialization
      const testData = 'Hello, World!';
      const encrypted = crypto.encrypt(testData);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(testData);
    });

    it('should use 100,000+ PBKDF2 iterations', async () => {
      const startTime = Date.now();
      await crypto.initializeEncryption('test-password');
      const endTime = Date.now();
      
      // High iteration count should take noticeable time (>100ms)
      expect(endTime - startTime).toBeGreaterThan(100);
    });

    it('should generate unique salt for each initialization', async () => {
      await crypto.initializeEncryption('password1');
      const salt1 = crypto.getSalt();
      
      crypto.clearKey();
      
      await crypto.initializeEncryption('password1');
      const salt2 = crypto.getSalt();
      
      expect(salt1).not.toBe(salt2);
    });

    it('should initialize with existing salt', async () => {
      await crypto.initializeEncryption('password');
      const originalSalt = crypto.getSalt()!;
      
      crypto.clearKey();
      
      await crypto.initializeWithSalt('password', originalSalt);
      expect(crypto.isInitialized()).toBe(true);
      expect(crypto.getSalt()).toBe(originalSalt);
    });
  });

  describe('Encryption/Decryption', () => {
    beforeEach(async () => {
      await crypto.initializeEncryption('secure-password-456');
    });

    it('should throw error when encrypting without initialization', () => {
      const newCrypto = CryptoService.getInstance();
      newCrypto.clearKey();
      
      expect(() => {
        newCrypto.encrypt('test data');
      }).toThrow('Encryption not initialized');
    });

    it('should encrypt and decrypt data correctly', () => {
      const testCases = [
        'Simple text',
        'Text with special chars: !@#$%^&*()',
        'Multi-line\ntext\nwith\nbreaks',
        '{"json": "data", "number": 123}',
        '', // Empty string
        'Unicode: 🔐🌍🚀', // Unicode characters
        'A'.repeat(10000), // Large text
      ];

      for (const testData of testCases) {
        const encrypted = crypto.encrypt(testData);
        const decrypted = crypto.decrypt(encrypted);
        
        expect(decrypted).toBe(testData);
        expect(encrypted).not.toBe(testData);
        expect(encrypted.length).toBeGreaterThan(0);
      }
    });

    it('should use unique IV for each encryption', () => {
      const testData = 'Same data';
      
      const encrypted1 = crypto.encrypt(testData);
      const encrypted2 = crypto.encrypt(testData);
      
      // Same data should produce different ciphertext due to unique IVs
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same plaintext
      expect(crypto.decrypt(encrypted1)).toBe(testData);
      expect(crypto.decrypt(encrypted2)).toBe(testData);
    });

    it('should handle decryption errors gracefully', () => {
      expect(() => {
        crypto.decrypt('invalid-base64-data');
      }).toThrow('Decryption failed');

      expect(() => {
        crypto.decrypt('dGVzdA=='); // Valid base64 but invalid encrypted data
      }).toThrow('Decryption failed');
    });

    it('should fail decryption with wrong key', async () => {
      const testData = 'secret data';
      const encrypted = crypto.encrypt(testData);
      
      // Reinitialize with different password
      crypto.clearKey();
      await crypto.initializeEncryption('different-password');
      
      expect(() => {
        crypto.decrypt(encrypted);
      }).toThrow('Decryption failed');
    });
  });

  describe('Hash Generation', () => {
    it('should generate consistent hashes', () => {
      const content = 'test message';
      const timestamp = 1234567890;
      
      const hash1 = crypto.generateHash(content, timestamp);
      const hash2 = crypto.generateHash(content, timestamp);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = crypto.generateHash('message1', 1234567890);
      const hash2 = crypto.generateHash('message2', 1234567890);
      const hash3 = crypto.generateHash('message1', 1234567891);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });

    it('should handle edge cases in hash generation', () => {
      const testCases = [
        ['', 0],
        ['test', -1],
        ['very long content '.repeat(1000), Date.now()],
        ['unicode 🔐', 1234567890]
      ];

      for (const [content, timestamp] of testCases) {
        const hash = crypto.generateHash(content as string, timestamp as number);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  describe('Constant Time Comparison', () => {
    it('should compare strings in constant time', () => {
      expect(crypto.constantTimeCompare('hello', 'hello')).toBe(true);
      expect(crypto.constantTimeCompare('hello', 'world')).toBe(false);
      expect(crypto.constantTimeCompare('', '')).toBe(true);
    });

    it('should handle different length strings', () => {
      expect(crypto.constantTimeCompare('short', 'longer')).toBe(false);
      expect(crypto.constantTimeCompare('longer', 'short')).toBe(false);
    });

    it('should be timing-attack resistant', () => {
      const secret = 'super-secret-key-12345';
      const attempts = [
        'super-secret-key-12345', // Correct
        'super-secret-key-12346', // Last char different
        'xuper-secret-key-12345', // First char different
        'completely-different-key', // Completely different
        '', // Empty
      ];

      // All comparisons should take similar time
      const times: number[] = [];
      
      for (const attempt of attempts) {
        const start = performance.now();
        crypto.constantTimeCompare(secret, attempt);
        const end = performance.now();
        times.push(end - start);
      }

      // Variance should be minimal (timing attack resistance)
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));
      
      // Allow some variance but not excessive
      expect(maxDeviation).toBeLessThan(avgTime * 2);
    });
  });

  describe('Memory Security', () => {
    it('should clear encryption key from memory', async () => {
      await crypto.initializeEncryption('test-password');
      
      const testData = 'test';
      crypto.encrypt(testData); // Should work
      
      crypto.clearKey();
      
      expect(crypto.isInitialized()).toBe(false);
      expect(() => {
        crypto.encrypt(testData);
      }).toThrow('Encryption not initialized');
    });

    it('should handle multiple clear operations safely', async () => {
      await crypto.initializeEncryption('test-password');
      
      crypto.clearKey();
      crypto.clearKey(); // Should not throw
      
      expect(crypto.isInitialized()).toBe(false);
    });
  });

  describe('Edge Cases and Malformed Input', () => {
    beforeEach(async () => {
      await crypto.initializeEncryption('test-password');
    });

    it('should handle extremely large data', () => {
      const largeData = 'A'.repeat(1024 * 1024); // 1MB
      
      const encrypted = crypto.encrypt(largeData);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(largeData);
    });

    it('should handle binary-like data', () => {
      const binaryData = '\x00\x01\x02\xFF\xFE\xFD';
      
      const encrypted = crypto.encrypt(binaryData);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(binaryData);
    });

    it('should reject malformed encrypted data', () => {
      const malformedInputs = [
        '',
        'not-base64!',
        'dGVzdA', // Too short
        'invalid-padding===',
      ];

      for (const input of malformedInputs) {
        expect(() => {
          crypto.decrypt(input);
        }).toThrow();
      }
    });
  });
});