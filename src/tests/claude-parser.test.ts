/**
 * Comprehensive tests for Claude parser with malformed input edge cases
 * Covers security constraints and input validation requirements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeParser } from '../lib/parsers/claude';
import { CryptoService } from '../lib/crypto';

describe('ClaudeParser', () => {
  let parser: ClaudeParser;
  let crypto: CryptoService;

  beforeEach(async () => {
    crypto = CryptoService.getInstance();
    await crypto.initializeEncryption('test-password');
    parser = new ClaudeParser();
  });

  const mockClaudeData = {
    uuid: 'claude-conv-123',
    name: 'Test Claude Conversation',
    summary: 'A test conversation with Claude',
    model: 'claude-3-sonnet',
    created_at: '2024-01-15T10:30:00.000Z',
    updated_at: '2024-01-15T11:45:00.000Z',
    chat_messages: [
      {
        uuid: 'msg-1',
        text: 'Hello Claude, how are you today?',
        sender: 'human',
        index: 0,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z'
      },
      {
        uuid: 'msg-2',
        text: 'Hello! I\'m doing well, thank you for asking. How can I help you today?',
        sender: 'assistant',
        index: 1,
        created_at: '2024-01-15T10:30:30.000Z',
        updated_at: '2024-01-15T10:30:30.000Z'
      }
    ]
  };

  describe('File Validation', () => {
    it('should validate valid Claude file', () => {
      const result = parser.validateClaudeFile(JSON.stringify(mockClaudeData));
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid JSON', () => {
      const result = parser.validateClaudeFile('invalid json');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should reject empty files', () => {
      const result = parser.validateClaudeFile('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Empty file');
    });

    it('should reject files that are too large', () => {
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // >100MB
      const result = parser.validateClaudeFile(largeContent);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File too large (>100MB)');
    });

    it('should reject missing required fields', () => {
      const testCases = [
        { ...mockClaudeData, uuid: undefined },
        { ...mockClaudeData, uuid: null },
        { ...mockClaudeData, uuid: 123 },
        { ...mockClaudeData, created_at: undefined },
        { ...mockClaudeData, updated_at: null },
        { ...mockClaudeData, chat_messages: undefined },
        { ...mockClaudeData, chat_messages: null },
        { ...mockClaudeData, chat_messages: 'not an array' },
      ];

      for (const invalidData of testCases) {
        const result = parser.validateClaudeFile(JSON.stringify(invalidData));
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should reject excessively long fields', () => {
      const longString = 'x'.repeat(2000);
      const invalidData = {
        ...mockClaudeData,
        uuid: longString
      };
      
      const result = parser.validateClaudeFile(JSON.stringify(invalidData));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject too many conversations', () => {
      const manyConversations = Array(10001).fill(mockClaudeData);
      const result = parser.validateClaudeFile(JSON.stringify(manyConversations));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many conversations (>10,000)');
    });

    it('should reject too many messages', () => {
      const manyMessages = Array(100001).fill(mockClaudeData.chat_messages[0]);
      const invalidData = {
        ...mockClaudeData,
        chat_messages: manyMessages
      };
      
      const result = parser.validateClaudeFile(JSON.stringify(invalidData));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many messages (>100,000)');
    });
  });

  describe('Parsing Valid Data', () => {
    it('should parse Claude conversation correctly', async () => {
      const result = await parser.parseClaude(JSON.stringify(mockClaudeData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const conversation = result.conversations[0];
      expect(conversation.id).toBe('claude-conv-123');
      expect(conversation.display_name).toBe('Test Claude Conversation');
      expect(conversation.source_app).toBe('Claude');
      expect(conversation.chat_type).toBe('llm');

      const messages = result.messages;
      expect(messages[0].author).toBe('User');
      expect(messages[0].content).toBe('Hello Claude, how are you today?');
      expect(messages[1].author).toBe('Claude');
      expect(messages[1].content).toBe('Hello! I\'m doing well, thank you for asking. How can I help you today?');
    });

    it('should handle array of conversations', async () => {
      const arrayData = [mockClaudeData, { ...mockClaudeData, uuid: 'claude-conv-456' }];
      const result = await parser.parseClaude(JSON.stringify(arrayData));
      
      expect(result.conversations).toHaveLength(2);
      expect(result.messages).toHaveLength(4);
    });

    it('should calculate conversation time bounds correctly', async () => {
      const result = await parser.parseClaude(JSON.stringify(mockClaudeData));
      const conversation = result.conversations[0];
      
      // Should use the earliest message time as start_time
      expect(conversation.start_time).toBe(1705316200); // 2024-01-15T10:30:00.000Z
      expect(conversation.end_time).toBe(1705320300); // 2024-01-15T11:45:00.000Z (updated_at)
    });

    it('should use fallback display name when name is missing', async () => {
      const dataWithoutName = {
        ...mockClaudeData,
        name: undefined,
        summary: 'Test summary'
      };
      
      const result = await parser.parseClaude(JSON.stringify(dataWithoutName));
      expect(result.conversations[0].display_name).toBe('Test summary');
    });

    it('should use default display name when both name and summary are missing', async () => {
      const dataWithoutNameOrSummary = {
        ...mockClaudeData,
        name: undefined,
        summary: undefined
      };
      
      const result = await parser.parseClaude(JSON.stringify(dataWithoutNameOrSummary));
      expect(result.conversations[0].display_name).toBe('Untitled Claude Chat');
    });
  });

  describe('Timestamp Parsing', () => {
    it('should parse valid ISO 8601 timestamps', async () => {
      const result = await parser.parseClaude(JSON.stringify(mockClaudeData));
      
      expect(result.messages[0].timestamp_utc).toBe(1705316200); // 2024-01-15T10:30:00.000Z
      expect(result.messages[1].timestamp_utc).toBe(1705316230); // 2024-01-15T10:30:30.000Z
    });

    it('should handle various ISO 8601 formats', async () => {
      const timestampFormats = [
        '2024-01-15T10:30:00Z',
        '2024-01-15T10:30:00.000Z',
        '2024-01-15T10:30:00+00:00',
        '2024-01-15T10:30:00.123456Z',
      ];

      for (const timestamp of timestampFormats) {
        const testData = {
          ...mockClaudeData,
          chat_messages: [{
            ...mockClaudeData.chat_messages[0],
            created_at: timestamp
          }]
        };

        const result = await parser.parseClaude(JSON.stringify(testData));
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].timestamp_utc).toBeGreaterThan(0);
      }
    });

    it('should reject invalid timestamps', async () => {
      const invalidTimestamps = [
        'invalid-date',
        '2024-13-45T25:70:70Z', // Invalid date components
        '2024-01-15', // Missing time
        '', // Empty string
        null,
        undefined
      ];

      for (const timestamp of invalidTimestamps) {
        const testData = {
          ...mockClaudeData,
          chat_messages: [{
            ...mockClaudeData.chat_messages[0],
            created_at: timestamp
          }]
        };

        const result = await parser.parseClaude(JSON.stringify(testData));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });

    it('should reject future timestamps', async () => {
      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days in future
      
      const testData = {
        ...mockClaudeData,
        chat_messages: [{
          ...mockClaudeData.chat_messages[0],
          created_at: futureDate
        }]
      };

      const result = await parser.parseClaude(JSON.stringify(testData));
      expect(result.messages).toHaveLength(0); // Should be filtered out
    });
  });

  describe('Content Type Detection', () => {
    it('should detect code content from patterns', async () => {
      const codePatterns = [
        'Here\'s a Python function:\n```python\ndef hello():\n    print("Hello")\n```',
        'Use `npm install` to install packages',
        'function test() {\n  return true;\n}',
        '// This is a comment\nconst x = 5;',
        'pip install requests',
        'SELECT * FROM users WHERE id = 1;',
        '/* Multi-line comment */',
        '<!-- HTML comment -->',
      ];

      for (const codeContent of codePatterns) {
        const codeData = {
          ...mockClaudeData,
          chat_messages: [{
            ...mockClaudeData.chat_messages[0],
            text: codeContent
          }]
        };

        const result = await parser.parseClaude(JSON.stringify(codeData));
        expect(result.messages[0].content_type).toBe('code');
      }
    });

    it('should detect text content for regular messages', async () => {
      const textContent = 'This is just a regular conversation message without any code.';
      
      const textData = {
        ...mockClaudeData,
        chat_messages: [{
          ...mockClaudeData.chat_messages[0],
          text: textContent
        }]
      };

      const result = await parser.parseClaude(JSON.stringify(textData));
      expect(result.messages[0].content_type).toBe('text');
    });
  });

  describe('Attachment Handling', () => {
    it('should process attachments correctly', async () => {
      const messageWithAttachment = {
        ...mockClaudeData.chat_messages[0],
        text: 'Here is a document for you to review.',
        attachments: [
          {
            file_name: 'document.pdf',
            file_type: 'application/pdf',
            file_size: 1024000,
            extracted_content: 'This is the extracted text from the PDF.'
          }
        ]
      };

      const dataWithAttachment = {
        ...mockClaudeData,
        chat_messages: [messageWithAttachment]
      };

      const result = await parser.parseClaude(JSON.stringify(dataWithAttachment));
      
      expect(result.messages[0].content).toContain('Here is a document for you to review.');
      expect(result.messages[0].content).toContain('[Attachment: document.pdf (application/pdf)]');
      expect(result.messages[0].content).toContain('Extracted content:');
      expect(result.messages[0].content).toContain('This is the extracted text from the PDF.');
    });

    it('should handle attachments without extracted content', async () => {
      const messageWithAttachment = {
        ...mockClaudeData.chat_messages[0],
        text: 'Here is an image.',
        attachments: [
          {
            file_name: 'image.jpg',
            file_type: 'image/jpeg',
            file_size: 512000
          }
        ]
      };

      const dataWithAttachment = {
        ...mockClaudeData,
        chat_messages: [messageWithAttachment]
      };

      const result = await parser.parseClaude(JSON.stringify(dataWithAttachment));
      
      expect(result.messages[0].content).toContain('[Attachment: image.jpg (image/jpeg)]');
      expect(result.messages[0].content).not.toContain('Extracted content:');
    });

    it('should sanitize attachment data', async () => {
      const messageWithDangerousAttachment = {
        ...mockClaudeData.chat_messages[0],
        text: 'Here is a file.',
        attachments: [
          {
            file_name: 'file\x00with\x01dangerous\x1Fchars.txt',
            file_type: 'text/plain\x00',
            file_size: 1000,
            extracted_content: 'Content with \x00dangerous\x01control\x1Fcharacters'
          }
        ]
      };

      const dataWithAttachment = {
        ...mockClaudeData,
        chat_messages: [messageWithDangerousAttachment]
      };

      const result = await parser.parseClaude(JSON.stringify(dataWithAttachment));
      
      expect(result.messages[0].content).not.toContain('\x00');
      expect(result.messages[0].content).not.toContain('\x01');
      expect(result.messages[0].content).not.toContain('\x1F');
    });
  });

  describe('Malformed Input Handling', () => {
    it('should handle malformed messages gracefully', async () => {
      const malformedData = {
        ...mockClaudeData,
        chat_messages: [
          null, // Null message
          'invalid', // String instead of object
          {}, // Empty object
          { uuid: 'msg-1' }, // Missing required fields
          {
            uuid: 'msg-2',
            text: '',
            sender: 'human',
            index: 0,
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z'
          }, // Empty text
          {
            uuid: 'msg-3',
            text: 'Valid message',
            sender: 'invalid_sender', // Invalid sender
            index: 1,
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z'
          },
          {
            uuid: 'msg-4',
            text: 'Another valid message',
            sender: 'human',
            index: 2,
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z'
          } // This should be the only valid message
        ]
      };

      const result = await parser.parseClaude(JSON.stringify(malformedData));
      expect(result.messages).toHaveLength(1); // Only the last valid message
      expect(result.messages[0].content).toBe('Another valid message');
    });

    it('should sanitize dangerous content', async () => {
      const dangerousData = {
        ...mockClaudeData,
        name: 'Chat with \x00null\x01bytes\x1F',
        chat_messages: [{
          uuid: 'msg-1',
          text: 'Message with \x00dangerous\x01control\x1Fcharacters',
          sender: 'human',
          index: 0,
          created_at: '2024-01-15T10:30:00.000Z',
          updated_at: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseClaude(JSON.stringify(dangerousData));
      
      expect(result.conversations[0].display_name).not.toContain('\x00');
      expect(result.conversations[0].display_name).not.toContain('\x01');
      expect(result.messages[0].content).not.toContain('\x00');
      expect(result.messages[0].content).not.toContain('\x01');
    });

    it('should handle extremely large conversations', async () => {
      const largeMessages = Array(60000).fill(null).map((_, i) => ({
        uuid: `msg-${i}`,
        text: `Message ${i}`,
        sender: i % 2 === 0 ? 'human' : 'assistant',
        index: i,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z'
      }));

      const largeData = {
        ...mockClaudeData,
        chat_messages: largeMessages
      };

      const result = await parser.parseClaude(JSON.stringify(largeData));
      expect(result.errors).toContain('Conversation too large (>50,000 messages)');
    });

    it('should handle extremely long content', async () => {
      const veryLongContent = 'A'.repeat(2 * 1024 * 1024); // 2MB
      
      const dataWithLongContent = {
        ...mockClaudeData,
        chat_messages: [{
          uuid: 'msg-1',
          text: veryLongContent,
          sender: 'human',
          index: 0,
          created_at: '2024-01-15T10:30:00.000Z',
          updated_at: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseClaude(JSON.stringify(dataWithLongContent));
      expect(result.messages[0].content.length).toBeLessThanOrEqual(1024 * 1024); // Should be truncated
    });

    it('should handle invalid sender types', async () => {
      const invalidSenders = [null, undefined, 123, {}, [], 'unknown_sender'];
      
      for (const sender of invalidSenders) {
        const dataWithInvalidSender = {
          ...mockClaudeData,
          chat_messages: [{
            uuid: 'msg-1',
            text: 'Test message',
            sender: sender,
            index: 0,
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z'
          }]
        };

        const result = await parser.parseClaude(JSON.stringify(dataWithInvalidSender));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });

    it('should handle negative or invalid indices', async () => {
      const invalidIndices = [-1, null, undefined, 'string', {}, []];
      
      for (const index of invalidIndices) {
        const dataWithInvalidIndex = {
          ...mockClaudeData,
          chat_messages: [{
            uuid: 'msg-1',
            text: 'Test message',
            sender: 'human',
            index: index,
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z'
          }]
        };

        const result = await parser.parseClaude(JSON.stringify(dataWithInvalidIndex));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });
  });

  describe('Message Ordering', () => {
    it('should sort messages by index correctly', async () => {
      const unorderedData = {
        ...mockClaudeData,
        chat_messages: [
          {
            uuid: 'msg-3',
            text: 'Third message',
            sender: 'human',
            index: 2,
            created_at: '2024-01-15T10:32:00.000Z',
            updated_at: '2024-01-15T10:32:00.000Z'
          },
          {
            uuid: 'msg-1',
            text: 'First message',
            sender: 'human',
            index: 0,
            created_at: '2024-01-15T10:30:00.000Z',
            updated_at: '2024-01-15T10:30:00.000Z'
          },
          {
            uuid: 'msg-2',
            text: 'Second message',
            sender: 'assistant',
            index: 1,
            created_at: '2024-01-15T10:31:00.000Z',
            updated_at: '2024-01-15T10:31:00.000Z'
          }
        ]
      };

      const result = await parser.parseClaude(JSON.stringify(unorderedData));
      
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].content).toBe('First message');
      expect(result.messages[1].content).toBe('Second message');
      expect(result.messages[2].content).toBe('Third message');
    });
  });
});