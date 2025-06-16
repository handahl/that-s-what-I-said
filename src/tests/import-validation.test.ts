/**
 * Comprehensive tests for centralized import validation service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ImportValidationService } from '../lib/importValidation';

describe('ImportValidationService', () => {
  let validation: ImportValidationService;

  beforeEach(() => {
    validation = ImportValidationService.getInstance();
    // Reset to default config
    validation.updateConfig({
      maxFileSize: 100 * 1024 * 1024,
      maxConversations: 10000,
      maxMessages: 100000,
      maxContentLength: 1024 * 1024,
      allowedFileTypes: ['chatgpt', 'claude', 'gemini', 'qwen', 'whatsapp'],
      enableFallbackDetection: true
    });
  });

  describe('File Size Validation', () => {
    it('should accept valid file sizes', () => {
      const content = 'Valid content';
      const error = validation.validateFileSize(content);
      expect(error).toBeNull();
    });

    it('should reject empty files', () => {
      const error = validation.validateFileSize('');
      expect(error).toBeTruthy();
      expect(error!.type).toBe('validation');
      expect(error!.severity).toBe('high');
      expect(error!.message).toBe('Empty file provided');
    });

    it('should reject oversized files', () => {
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // >100MB
      const error = validation.validateFileSize(largeContent);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('File too large');
    });

    it('should include file path in error', () => {
      const error = validation.validateFileSize('', '/path/to/file.json');
      expect(error!.file).toBe('/path/to/file.json');
    });
  });

  describe('Encoding Validation', () => {
    it('should accept valid UTF-8 content', () => {
      const content = 'Valid UTF-8 content with émojis 🚀 and Chinese 你好';
      const error = validation.validateEncoding(content);
      expect(error).toBeNull();
    });

    it('should detect replacement characters', () => {
      const content = 'Content with replacement char: \uFFFD';
      const error = validation.validateEncoding(content);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('invalid UTF-8 sequences');
    });

    it('should detect excessive control characters', () => {
      const content = 'Content with\x00many\x01control\x02chars\x03'.repeat(10);
      const error = validation.validateEncoding(content);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('dangerous control characters');
    });

    it('should allow some control characters', () => {
      const content = 'Content with\nnewlines\tand\ttabs';
      const error = validation.validateEncoding(content);
      expect(error).toBeNull();
    });

    it('should handle encoding validation errors', () => {
      // Mock a scenario where encoding validation throws
      const originalMatch = String.prototype.match;
      String.prototype.match = () => { throw new Error('Test error'); };

      const error = validation.validateEncoding('test content');
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Encoding validation failed');

      // Restore original method
      String.prototype.match = originalMatch;
    });
  });

  describe('JSON Structure Validation', () => {
    it('should accept valid JSON', () => {
      const content = JSON.stringify({ valid: 'json', data: [1, 2, 3] });
      const error = validation.validateJSONStructure(content);
      expect(error).toBeNull();
    });

    it('should accept non-JSON content', () => {
      const content = 'This is not JSON';
      const error = validation.validateJSONStructure(content);
      expect(error).toBeNull(); // Should skip validation for non-JSON
    });

    it('should reject malformed JSON', () => {
      const content = '{ invalid: json }';
      const error = validation.validateJSONStructure(content);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Invalid JSON structure');
    });

    it('should handle JSON arrays', () => {
      const content = JSON.stringify([{ item: 1 }, { item: 2 }]);
      const error = validation.validateJSONStructure(content);
      expect(error).toBeNull();
    });
  });

  describe('Count Validations', () => {
    it('should accept valid conversation counts', () => {
      const error = validation.validateConversationCount(100);
      expect(error).toBeNull();
    });

    it('should reject excessive conversation counts', () => {
      const error = validation.validateConversationCount(15000);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Too many conversations');
    });

    it('should accept valid message counts', () => {
      const error = validation.validateMessageCount(5000);
      expect(error).toBeNull();
    });

    it('should reject excessive message counts', () => {
      const error = validation.validateMessageCount(150000);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Too many messages');
    });
  });

  describe('Content Length Validation', () => {
    it('should accept normal content length', () => {
      const content = 'Normal length content';
      const error = validation.validateContentLength(content);
      expect(error).toBeNull();
    });

    it('should reject excessive content length', () => {
      const content = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const error = validation.validateContentLength(content);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Content too long');
    });
  });

  describe('File Type Validation', () => {
    it('should accept supported file types', () => {
      const supportedTypes = ['chatgpt', 'claude', 'gemini', 'qwen', 'whatsapp'];
      
      for (const type of supportedTypes) {
        const error = validation.validateFileType(type as any);
        expect(error).toBeNull();
      }
    });

    it('should reject unsupported file types', () => {
      const error = validation.validateFileType('unsupported' as any);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Unsupported file type');
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize dangerous control characters', () => {
      const dangerous = 'Content with\x00null\x01bytes\x1F';
      const sanitized = validation.sanitizeContent(dangerous);
      
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x01');
      expect(sanitized).not.toContain('\x1F');
      expect(sanitized).toBe('Content with');
    });

    it('should preserve formatting characters', () => {
      const content = 'Content with\nnewlines\tand\ttabs';
      const sanitized = validation.sanitizeContent(content);
      
      expect(sanitized).toContain('\n');
      expect(sanitized).toContain('\t');
    });

    it('should handle Unicode normalization', () => {
      const content = 'Café naïve résumé'; // Contains combining characters
      const sanitized = validation.sanitizeContent(content);
      
      expect(sanitized).toBe('Café naïve résumé');
    });

    it('should handle normalization errors gracefully', () => {
      // Mock normalize to throw an error
      const originalNormalize = String.prototype.normalize;
      String.prototype.normalize = () => { throw new Error('Normalization error'); };

      const content = 'Test content';
      const sanitized = validation.sanitizeContent(content);
      
      expect(sanitized).toBe('Test content'); // Should continue with original

      // Restore original method
      String.prototype.normalize = originalNormalize;
    });

    it('should apply length limits', () => {
      const longContent = 'x'.repeat(1000);
      const sanitized = validation.sanitizeContent(longContent, 100);
      
      expect(sanitized.length).toBe(100);
    });

    it('should handle surrogate pairs correctly', () => {
      const emoji = '🚀🌟💫'; // Multi-byte characters
      const sanitized = validation.sanitizeContent(emoji + 'x'.repeat(100), 5);
      
      // Should not cut in middle of emoji
      expect(sanitized).not.toContain('\uFFFD');
      expect(sanitized.length).toBeLessThanOrEqual(5);
    });

    it('should handle non-string input', () => {
      const sanitized = validation.sanitizeContent(null as any);
      expect(sanitized).toBe('');
    });

    it('should trim whitespace', () => {
      const content = '  \n  Content with whitespace  \t  ';
      const sanitized = validation.sanitizeContent(content);
      expect(sanitized).toBe('Content with whitespace');
    });
  });

  describe('Timestamp Validation', () => {
    it('should accept valid timestamps', () => {
      const now = Math.floor(Date.now() / 1000);
      const error = validation.validateTimestamp(now);
      expect(error).toBeNull();
    });

    it('should reject negative timestamps', () => {
      const error = validation.validateTimestamp(-1);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('negative value');
    });

    it('should reject future timestamps', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60; // 2 days future
      const error = validation.validateTimestamp(futureTime);
      expect(error).toBeTruthy();
      expect(error!.message).toContain('too far in future');
    });

    it('should warn about very old timestamps', () => {
      const oldTime = 946684800 - 1; // Before year 2000
      const error = validation.validateTimestamp(oldTime);
      expect(error).toBeTruthy();
      expect(error!.severity).toBe('low');
      expect(error!.message).toContain('before year 2000');
    });

    it('should accept timestamps from year 2000 onwards', () => {
      const year2000 = 946684800; // 2000-01-01 00:00:00 UTC
      const error = validation.validateTimestamp(year2000);
      expect(error).toBeNull();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxFileSize: 50 * 1024 * 1024,
        maxConversations: 5000
      };

      validation.updateConfig(newConfig);
      const config = validation.getConfig();

      expect(config.maxFileSize).toBe(50 * 1024 * 1024);
      expect(config.maxConversations).toBe(5000);
      // Other values should remain unchanged
      expect(config.maxMessages).toBe(100000);
    });

    it('should return current configuration', () => {
      const config = validation.getConfig();
      
      expect(config).toHaveProperty('maxFileSize');
      expect(config).toHaveProperty('maxConversations');
      expect(config).toHaveProperty('maxMessages');
      expect(config).toHaveProperty('allowedFileTypes');
      expect(config).toHaveProperty('enableFallbackDetection');
    });

    it('should not modify original config object', () => {
      const config1 = validation.getConfig();
      const config2 = validation.getConfig();
      
      config1.maxFileSize = 999;
      expect(config2.maxFileSize).not.toBe(999);
    });
  });

  describe('Error Object Creation', () => {
    it('should create properly formatted error objects', () => {
      const error = validation.validateFileSize('');
      
      expect(error).toHaveProperty('type');
      expect(error).toHaveProperty('severity');
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('timestamp');
      expect(error!.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should include file path when provided', () => {
      const filePath = '/path/to/test.json';
      const error = validation.validateFileSize('', filePath);
      
      expect(error!.file).toBe(filePath);
    });

    it('should handle missing file path', () => {
      const error = validation.validateFileSize('');
      
      expect(error!.file).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely large valid content', () => {
      const largeValidContent = 'x'.repeat(50 * 1024 * 1024); // 50MB
      const error = validation.validateFileSize(largeValidContent);
      expect(error).toBeNull();
    });

    it('should handle boundary conditions', () => {
      // Test exact limits
      const config = validation.getConfig();
      
      const exactSizeError = validation.validateFileSize('x'.repeat(config.maxFileSize));
      expect(exactSizeError).toBeNull();
      
      const overSizeError = validation.validateFileSize('x'.repeat(config.maxFileSize + 1));
      expect(overSizeError).toBeTruthy();
    });

    it('should handle special Unicode characters', () => {
      const specialChars = '𝕳𝖊𝖑𝖑𝖔 𝖂𝖔𝖗𝖑𝖉'; // Mathematical bold characters
      const sanitized = validation.sanitizeContent(specialChars);
      expect(sanitized).toBe(specialChars);
    });

    it('should handle mixed content types', () => {
      const mixedContent = 'Text with\x00control\nchars and 🚀 emojis';
      const sanitized = validation.sanitizeContent(mixedContent);
      
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).toContain('\n');
      expect(sanitized).toContain('🚀');
    });
  });
});