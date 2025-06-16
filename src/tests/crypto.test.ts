/**
 * Tests for cryptographic utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from '../lib/crypto';

describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(() => {
    crypto = CryptoService.getInstance();
  });

  it('should initialize encryption with password', async () => {
    await crypto.initializeEncryption('test-password-123');
    
    // Should be able to encrypt/decrypt after initialization
    const testData = 'Hello, World!';
    const encrypted = crypto.encrypt(testData);
    const decrypted = crypto.decrypt(encrypted);
    
    expect(decrypted).toBe(testData);
  });

  it('should throw error when encrypting without initialization', () => {
    const newCrypto = CryptoService.getInstance();
    newCrypto.clearKey();
    
    expect(() => {
      newCrypto.encrypt('test data');
    }).toThrow('Encryption not initialized');
  });

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

  it('should encrypt and decrypt data correctly', async () => {
    await crypto.initializeEncryption('secure-password-456');
    
    const testCases = [
      'Simple text',
      'Text with special chars: !@#$%^&*()',
      'Multi-line\ntext\nwith\nbreaks',
      '{"json": "data", "number": 123}',
      ''
    ];

    for (const testData of testCases) {
      const encrypted = crypto.encrypt(testData);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(testData);
      expect(encrypted).not.toBe(testData);
    }
  });

  it('should clear encryption key', async () => {
    await crypto.initializeEncryption('test-password');
    
    const testData = 'test';
    crypto.encrypt(testData); // Should work
    
    crypto.clearKey();
    
    expect(() => {
      crypto.encrypt(testData);
    }).toThrow('Encryption not initialized');
  });
});