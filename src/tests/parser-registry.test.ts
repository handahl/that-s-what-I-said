/**
 * Comprehensive tests for parser registry with fallback logic and format detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParserRegistry } from '../lib/parserRegistry';
import { ImportValidationService } from '../lib/importValidation';

// Mock the parser modules
vi.mock('../lib/parsers/chatgpt', () => ({
  ChatGPTParser: vi.fn().mockImplementation(() => ({
    validateChatGPTFile: vi.fn(),
    parseChatGPT: vi.fn()
  }))
}));

vi.mock('../lib/parsers/claude', () => ({
  ClaudeParser: vi.fn().mockImplementation(() => ({
    validateClaudeFile: vi.fn(),
    parseClaude: vi.fn()
  }))
}));

vi.mock('../lib/parsers/gemini', () => ({
  GeminiParser: vi.fn().mockImplementation(() => ({
    validateGeminiFile: vi.fn(),
    parseGemini: vi.fn()
  }))
}));

vi.mock('../lib/parsers/qwen', () => ({
  QwenParser: vi.fn().mockImplementation(() => ({
    validateQwenFile: vi.fn(),
    parseQwen: vi.fn()
  }))
}));

describe('ParserRegistry', () => {
  let registry: ParserRegistry;
  let validation: ImportValidationService;

  beforeEach(() => {
    registry = ParserRegistry.getInstance();
    validation = ImportValidationService.getInstance();
    vi.clearAllMocks();
  });

  const mockChatGPTContent = JSON.stringify({
    conversation_id: 'test-conv-123',
    title: 'Test Conversation',
    mapping: {
      'node1': {
        id: 'node1',
        message: {
          id: 'msg1',
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['Hello'] },
          create_time: 1640995200
        }
      }
    }
  });

  const mockClaudeContent = JSON.stringify({
    uuid: 'claude-conv-123',
    name: 'Test Claude Conversation',
    created_at: '2024-01-15T10:30:00.000Z',
    updated_at: '2024-01-15T11:45:00.000Z',
    chat_messages: [{
      uuid: 'msg-1',
      text: 'Hello Claude!',
      sender: 'human',
      index: 0,
      created_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-01-15T10:30:00.000Z'
    }]
  });

  const mockGeminiContent = JSON.stringify({
    conversations: [{
      conversation_id: 'gemini-conv-123',
      conversation_title: 'Test Gemini Conversation',
      create_time: '2024-01-15T10:30:00.000Z',
      update_time: '2024-01-15T11:45:00.000Z',
      messages: [{
        id: 'msg-1',
        author: { name: 'user' },
        create_time: '2024-01-15T10:30:00.000Z',
        text: 'Hello Gemini!'
      }]
    }]
  });

  const mockQwenContent = JSON.stringify({
    conversation_id: 'qwen-conv-123',
    title: 'Test Qwen Conversation',
    messages: [{
      id: 'msg-1',
      role: 'user',
      content: 'Hello Qwen!',
      timestamp: '2024-01-15T10:30:00.000Z'
    }]
  });

  describe('Format Detection', () => {
    it('should detect ChatGPT format correctly', () => {
      const result = registry.detectFileFormat(mockChatGPTContent);
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('chatgpt');
      expect(result.confidence).toBeGreaterThan(80);
      expect(result.fallbackAttempted).toBe(false);
    });

    it('should detect Claude format correctly', () => {
      const result = registry.detectFileFormat(mockClaudeContent);
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('claude');
      expect(result.confidence).toBeGreaterThan(80);
      expect(result.fallbackAttempted).toBe(false);
    });

    it('should detect Gemini format correctly', () => {
      const result = registry.detectFileFormat(mockGeminiContent);
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('gemini');
      expect(result.confidence).toBeGreaterThan(80);
      expect(result.fallbackAttempted).toBe(false);
    });

    it('should detect Qwen format correctly', () => {
      const result = registry.detectFileFormat(mockQwenContent);
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('qwen');
      expect(result.confidence).toBeGreaterThan(80);
      expect(result.fallbackAttempted).toBe(false);
    });

    it('should follow parser priority order', () => {
      // Create ambiguous content that could match multiple formats
      const ambiguousContent = JSON.stringify({
        conversation_id: 'test-123',
        uuid: 'also-has-uuid',
        title: 'Test',
        mapping: {},
        chat_messages: [],
        conversations: [],
        messages: []
      });

      const result = registry.detectFileFormat(ambiguousContent);
      
      // Should detect as ChatGPT since it's first in priority order
      expect(result.fileType).toBe('chatgpt');
    });
  });

  describe('Confidence Scoring', () => {
    it('should calculate ChatGPT confidence correctly', () => {
      const parser = registry.getParser('chatgpt');
      expect(parser).toBeTruthy();

      const confidence = parser!.getFormatConfidence(mockChatGPTContent);
      expect(confidence).toBeGreaterThan(90);
    });

    it('should calculate Claude confidence correctly', () => {
      const parser = registry.getParser('claude');
      expect(parser).toBeTruthy();

      const confidence = parser!.getFormatConfidence(mockClaudeContent);
      expect(confidence).toBeGreaterThan(90);
    });

    it('should calculate Gemini confidence correctly', () => {
      const parser = registry.getParser('gemini');
      expect(parser).toBeTruthy();

      const confidence = parser!.getFormatConfidence(mockGeminiContent);
      expect(confidence).toBeGreaterThan(80);
    });

    it('should calculate Qwen confidence correctly', () => {
      const parser = registry.getParser('qwen');
      expect(parser).toBeTruthy();

      const confidence = parser!.getFormatConfidence(mockQwenContent);
      expect(confidence).toBeGreaterThan(80);
    });

    it('should return low confidence for unrecognized content', () => {
      const parser = registry.getParser('chatgpt');
      const confidence = parser!.getFormatConfidence('invalid content');
      expect(confidence).toBe(0);
    });

    it('should handle Qwen text log format confidence', () => {
      const textLogContent = `2024-01-15 10:30:00 user: Hello
2024-01-15 10:30:30 assistant: Hi there!`;

      const parser = registry.getParser('qwen');
      const confidence = parser!.getFormatConfidence(textLogContent);
      expect(confidence).toBeGreaterThan(50);
    });

    it('should give bonus confidence for Chinese content in Qwen', () => {
      const chineseContent = JSON.stringify({
        conversation_id: 'qwen-chinese-123',
        title: '与通义千问的对话',
        messages: [{
          role: '用户',
          content: '你好，通义千问！'
        }]
      });

      const parser = registry.getParser('qwen');
      const confidence = parser!.getFormatConfidence(chineseContent);
      expect(confidence).toBeGreaterThan(85);
    });
  });

  describe('Fallback Detection', () => {
    it('should attempt fallback when no parser succeeds', () => {
      // Enable fallback detection
      validation.updateConfig({ enableFallbackDetection: true });

      // Create content that partially matches ChatGPT but fails validation
      const partialContent = JSON.stringify({
        conversation_id: 'test-123',
        title: 'Test',
        // Missing mapping field
      });

      const result = registry.detectFileFormat(partialContent);
      
      expect(result.fallbackAttempted).toBe(true);
      if (result.isValid) {
        expect(result.warning).toContain('Format detection uncertain');
        expect(result.confidence).toBeGreaterThan(30);
      }
    });

    it('should not use fallback when disabled', () => {
      validation.updateConfig({ enableFallbackDetection: false });

      const partialContent = JSON.stringify({
        conversation_id: 'test-123',
        title: 'Test'
      });

      const result = registry.detectFileFormat(partialContent);
      
      expect(result.isValid).toBe(false);
      expect(result.fileType).toBe('unknown');
    });

    it('should select highest confidence parser in fallback', () => {
      validation.updateConfig({ enableFallbackDetection: true });

      // Content that has some ChatGPT features but more Claude features
      const mixedContent = JSON.stringify({
        conversation_id: 'test-123', // ChatGPT feature
        uuid: 'claude-uuid-456',     // Claude feature
        chat_messages: [             // Claude feature
          {
            sender: 'human',         // Claude feature
            text: 'Hello'
          }
        ]
      });

      const result = registry.detectFileFormat(mixedContent);
      
      if (result.isValid && result.fallbackAttempted) {
        // Should prefer Claude due to more matching features
        expect(result.fileType).toBe('claude');
      }
    });

    it('should reject fallback with very low confidence', () => {
      validation.updateConfig({ enableFallbackDetection: true });

      const lowConfidenceContent = JSON.stringify({
        random: 'data',
        structure: 'unknown'
      });

      const result = registry.detectFileFormat(lowConfidenceContent);
      
      expect(result.isValid).toBe(false);
      expect(result.fileType).toBe('unknown');
      expect(result.fallbackAttempted).toBe(true);
    });
  });

  describe('Parser Management', () => {
    it('should return available parsers', () => {
      const parsers = registry.getAvailableParsers();
      
      expect(parsers).toContain('chatgpt');
      expect(parsers).toContain('claude');
      expect(parsers).toContain('gemini');
      expect(parsers).toContain('qwen');
    });

    it('should get specific parser', () => {
      const chatgptParser = registry.getParser('chatgpt');
      expect(chatgptParser).toBeTruthy();
      expect(chatgptParser!.name).toBe('ChatGPT Parser');
      expect(chatgptParser!.supportedTypes).toContain('chatgpt');
    });

    it('should return null for unknown parser', () => {
      const unknownParser = registry.getParser('unknown' as any);
      expect(unknownParser).toBeNull();
    });

    it('should allow parser order customization', () => {
      const originalOrder = ['chatgpt', 'claude', 'gemini', 'qwen'];
      const newOrder = ['qwen', 'gemini', 'claude', 'chatgpt'];
      
      registry.setParserOrder(newOrder);
      
      // Test with ambiguous content - should now prefer Qwen
      const ambiguousContent = JSON.stringify({
        conversation_id: 'test-123',
        messages: [{
          role: 'user',
          content: 'Hello'
        }]
      });

      const result = registry.detectFileFormat(ambiguousContent);
      expect(result.fileType).toBe('qwen'); // Should be detected first now
    });
  });

  describe('Error Handling', () => {
    it('should handle parser exceptions gracefully', () => {
      // Mock a parser to throw an error
      const mockParser = registry.getParser('chatgpt');
      if (mockParser) {
        vi.spyOn(mockParser, 'validateFile').mockImplementation(() => {
          throw new Error('Parser error');
        });
      }

      const result = registry.detectFileFormat(mockChatGPTContent);
      
      // Should continue with other parsers
      expect(result.fileType).not.toBe('chatgpt');
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJSON = '{ invalid json }';
      
      const result = registry.detectFileFormat(malformedJSON);
      
      expect(result.isValid).toBe(false);
      expect(result.fileType).toBe('unknown');
    });

    it('should handle empty content', () => {
      const result = registry.detectFileFormat('');
      
      expect(result.isValid).toBe(false);
      expect(result.fileType).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should handle non-JSON content for text parsers', () => {
      const textContent = 'This is plain text, not JSON';
      
      const result = registry.detectFileFormat(textContent);
      
      // Should still attempt detection (might be text log format)
      expect(result.fileType).toBeDefined();
    });
  });

  describe('Format-Specific Edge Cases', () => {
    it('should handle ChatGPT array format', () => {
      const arrayContent = JSON.stringify([mockChatGPTContent]);
      
      const parser = registry.getParser('chatgpt');
      const confidence = parser!.getFormatConfidence(arrayContent);
      
      expect(confidence).toBeGreaterThan(50);
    });

    it('should handle Gemini Takeout format', () => {
      const takeoutContent = JSON.stringify({
        id: 'takeout-conv-123',
        name: 'Test Takeout',
        created_date: '2024-01-15T10:30:00.000Z',
        updated_date: '2024-01-15T11:45:00.000Z',
        messages: [{
          creator: { name: 'John Doe' },
          created_date: '2024-01-15T10:30:00.000Z',
          content: 'Hello!'
        }]
      });

      const parser = registry.getParser('gemini');
      const confidence = parser!.getFormatConfidence(takeoutContent);
      
      expect(confidence).toBeGreaterThan(60);
    });

    it('should handle Qwen alternative formats', () => {
      const altContent = JSON.stringify({
        session_id: 'qwen-session-123',
        chat_history: [{
          sender: 'human',
          text: 'Hello Qwen!'
        }]
      });

      const parser = registry.getParser('qwen');
      const confidence = parser!.getFormatConfidence(altContent);
      
      expect(confidence).toBeGreaterThan(50);
    });
  });
});