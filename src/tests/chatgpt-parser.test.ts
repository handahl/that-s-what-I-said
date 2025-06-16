/**
 * Enhanced tests for ChatGPT parser with malformed input edge cases
 * Covers security constraints and input validation requirements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatGPTParser } from '../lib/parsers/chatgpt';
import { CryptoService } from '../lib/crypto';

describe('ChatGPTParser', () => {
  let parser: ChatGPTParser;
  let crypto: CryptoService;

  beforeEach(async () => {
    crypto = CryptoService.getInstance();
    await crypto.initializeEncryption('test-password');
    parser = new ChatGPTParser();
  });

  const mockChatGPTData = {
    conversation_id: 'test-conv-123',
    title: 'Test Conversation',
    mapping: {
      'node1': {
        id: 'node1',
        message: {
          id: 'msg1',
          author: { role: 'user' },
          content: {
            content_type: 'text',
            parts: ['Hello, how are you?']
          },
          create_time: 1640995200
        },
        parent: null,
        children: ['node2']
      },
      'node2': {
        id: 'node2',
        message: {
          id: 'msg2',
          author: { role: 'assistant' },
          content: {
            content_type: 'text',
            parts: ['I am doing well, thank you! How can I help you today?']
          },
          create_time: 1640995260
        },
        parent: 'node1',
        children: []
      }
    }
  };

  describe('File Validation', () => {
    it('should validate valid ChatGPT file', () => {
      const result = parser.validateChatGPTFile(JSON.stringify(mockChatGPTData));
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid JSON', () => {
      const result = parser.validateChatGPTFile('invalid json');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should reject empty files', () => {
      const result = parser.validateChatGPTFile('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Empty file');
    });

    it('should reject files that are too large', () => {
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // >100MB
      const result = parser.validateChatGPTFile(largeContent);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File too large (>100MB)');
    });

    it('should reject missing required fields', () => {
      const testCases = [
        { ...mockChatGPTData, conversation_id: undefined },
        { ...mockChatGPTData, conversation_id: null },
        { ...mockChatGPTData, conversation_id: 123 },
        { ...mockChatGPTData, title: undefined },
        { ...mockChatGPTData, title: null },
        { ...mockChatGPTData, mapping: undefined },
        { ...mockChatGPTData, mapping: null },
        { ...mockChatGPTData, mapping: [] },
      ];

      for (const invalidData of testCases) {
        const result = parser.validateChatGPTFile(JSON.stringify(invalidData));
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should reject excessively long fields', () => {
      const longString = 'x'.repeat(2000);
      const invalidData = {
        ...mockChatGPTData,
        conversation_id: longString
      };
      
      const result = parser.validateChatGPTFile(JSON.stringify(invalidData));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject too many conversations', () => {
      const manyConversations = Array(10001).fill(mockChatGPTData);
      const result = parser.validateChatGPTFile(JSON.stringify(manyConversations));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many conversations (>10,000)');
    });
  });

  describe('Parsing Valid Data', () => {
    it('should parse ChatGPT conversation correctly', async () => {
      const result = await parser.parseChatGPT(JSON.stringify(mockChatGPTData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const conversation = result.conversations[0];
      expect(conversation.id).toBe('test-conv-123');
      expect(conversation.display_name).toBe('Test Conversation');
      expect(conversation.source_app).toBe('ChatGPT');
      expect(conversation.chat_type).toBe('llm');

      const messages = result.messages;
      expect(messages[0].author).toBe('User');
      expect(messages[0].content).toBe('Hello, how are you?');
      expect(messages[1].author).toBe('ChatGPT');
      expect(messages[1].content).toBe('I am doing well, thank you! How can I help you today?');
    });

    it('should handle array of conversations', async () => {
      const arrayData = [mockChatGPTData, { ...mockChatGPTData, conversation_id: 'test-conv-456' }];
      const result = await parser.parseChatGPT(JSON.stringify(arrayData));
      
      expect(result.conversations).toHaveLength(2);
      expect(result.messages).toHaveLength(4);
    });

    it('should calculate conversation time bounds correctly', async () => {
      const result = await parser.parseChatGPT(JSON.stringify(mockChatGPTData));
      const conversation = result.conversations[0];
      
      expect(conversation.start_time).toBe(1640995200);
      expect(conversation.end_time).toBe(1640995260);
    });
  });

  describe('Content Type Detection', () => {
    it('should detect code content type from metadata', async () => {
      const codeData = {
        ...mockChatGPTData,
        mapping: {
          'node1': {
            id: 'node1',
            message: {
              id: 'msg1',
              author: { role: 'user' },
              content: {
                content_type: 'code',
                parts: ['print("Hello World")']
              },
              create_time: 1640995200
            },
            parent: null,
            children: []
          }
        }
      };

      const result = await parser.parseChatGPT(JSON.stringify(codeData));
      expect(result.messages[0].content_type).toBe('code');
    });

    it('should detect code content from patterns', async () => {
      const codePatterns = [
        'Write a Python function:\n```python\ndef hello():\n    print("Hello")\n```',
        'Use `npm install` to install packages',
        'function test() {\n  return true;\n}',
        '// This is a comment\nconst x = 5;',
        'pip install requests',
        '/* Multi-line comment */',
        '<!-- HTML comment -->',
      ];

      for (const codeContent of codePatterns) {
        const codeData = {
          ...mockChatGPTData,
          mapping: {
            'node1': {
              id: 'node1',
              message: {
                id: 'msg1',
                author: { role: 'user' },
                content: {
                  content_type: 'text',
                  parts: [codeContent]
                },
                create_time: 1640995200
              },
              parent: null,
              children: []
            }
          }
        };

        const result = await parser.parseChatGPT(JSON.stringify(codeData));
        expect(result.messages[0].content_type).toBe('code');
      }
    });
  });

  describe('Malformed Input Handling', () => {
    it('should skip system messages', async () => {
      const dataWithSystem = {
        ...mockChatGPTData,
        mapping: {
          'system': {
            id: 'system',
            message: {
              id: 'sys1',
              author: { role: 'system' },
              content: {
                content_type: 'text',
                parts: ['System message']
              },
              create_time: 1640995100
            },
            parent: null,
            children: ['node1']
          },
          ...mockChatGPTData.mapping
        }
      };

      const result = await parser.parseChatGPT(JSON.stringify(dataWithSystem));
      expect(result.messages).toHaveLength(2); // Should still be 2, system message skipped
      expect(result.messages.every(m => m.author !== 'system')).toBe(true);
    });

    it('should handle empty or malformed messages gracefully', async () => {
      const malformedData = {
        ...mockChatGPTData,
        mapping: {
          'empty': {
            id: 'empty',
            message: {
              id: 'empty',
              author: { role: 'user' },
              content: {
                content_type: 'text',
                parts: ['']
              },
              create_time: 1640995200
            },
            parent: null,
            children: []
          },
          'missing_parts': {
            id: 'missing_parts',
            message: {
              id: 'missing_parts',
              author: { role: 'user' },
              content: {
                content_type: 'text'
              },
              create_time: 1640995300
            },
            parent: null,
            children: []
          },
          'invalid_timestamp': {
            id: 'invalid_timestamp',
            message: {
              id: 'invalid_timestamp',
              author: { role: 'user' },
              content: {
                content_type: 'text',
                parts: ['Valid content']
              },
              create_time: -1
            },
            parent: null,
            children: []
          },
          'future_timestamp': {
            id: 'future_timestamp',
            message: {
              id: 'future_timestamp',
              author: { role: 'user' },
              content: {
                content_type: 'text',
                parts: ['Valid content']
              },
              create_time: Date.now() / 1000 + 100000 // Far future
            },
            parent: null,
            children: []
          }
        }
      };

      const result = await parser.parseChatGPT(JSON.stringify(malformedData));
      expect(result.messages).toHaveLength(0); // All messages should be filtered out
    });

    it('should handle malformed node structures', async () => {
      const malformedMapping = {
        ...mockChatGPTData,
        mapping: {
          'null_node': null,
          'string_node': 'invalid',
          'missing_message': {
            id: 'missing_message',
            parent: null,
            children: []
          },
          'invalid_message': {
            id: 'invalid_message',
            message: 'not an object',
            parent: null,
            children: []
          },
          'valid_node': mockChatGPTData.mapping.node1
        }
      };

      const result = await parser.parseChatGPT(JSON.stringify(malformedMapping));
      expect(result.messages).toHaveLength(1); // Only valid node should be processed
      expect(result.errors).toHaveLength(0); // Should handle gracefully without errors
    });

    it('should sanitize dangerous content', async () => {
      const dangerousContent = {
        ...mockChatGPTData,
        title: 'Title with \x00null\x01bytes\x1F',
        mapping: {
          'node1': {
            id: 'node1',
            message: {
              id: 'msg1',
              author: { role: 'user' },
              content: {
                content_type: 'text',
                parts: ['Content with \x00dangerous\x01control\x1Fcharacters']
              },
              create_time: 1640995200
            },
            parent: null,
            children: []
          }
        }
      };

      const result = await parser.parseChatGPT(JSON.stringify(dangerousContent));
      
      expect(result.conversations[0].display_name).not.toContain('\x00');
      expect(result.conversations[0].display_name).not.toContain('\x01');
      expect(result.messages[0].content).not.toContain('\x00');
      expect(result.messages[0].content).not.toContain('\x01');
    });

    it('should handle extremely large conversations', async () => {
      const largeMapping: any = {};
      
      // Create a conversation with many messages
      for (let i = 0; i < 60000; i++) {
        largeMapping[`node${i}`] = {
          id: `node${i}`,
          message: {
            id: `msg${i}`,
            author: { role: i % 2 === 0 ? 'user' : 'assistant' },
            content: {
              content_type: 'text',
              parts: [`Message ${i}`]
            },
            create_time: 1640995200 + i
          },
          parent: i > 0 ? `node${i-1}` : null,
          children: i < 59999 ? [`node${i+1}`] : []
        };
      }

      const largeData = {
        ...mockChatGPTData,
        mapping: largeMapping
      };

      const result = await parser.parseChatGPT(JSON.stringify(largeData));
      expect(result.errors).toContain('Conversation too large (>50,000 messages)');
    });

    it('should handle invalid author roles', async () => {
      const invalidRoles = [null, undefined, 123, {}, [], 'unknown_role'];
      
      for (const role of invalidRoles) {
        const dataWithInvalidRole = {
          ...mockChatGPTData,
          mapping: {
            'node1': {
              id: 'node1',
              message: {
                id: 'msg1',
                author: { role: role },
                content: {
                  content_type: 'text',
                  parts: ['Test message']
                },
                create_time: 1640995200
              },
              parent: null,
              children: []
            }
          }
        };

        const result = await parser.parseChatGPT(JSON.stringify(dataWithInvalidRole));
        
        if (typeof role === 'string') {
          expect(result.messages).toHaveLength(1);
          expect(result.messages[0].author).toBe(role.length <= 50 ? role : role.substring(0, 50));
        } else {
          expect(result.messages).toHaveLength(0); // Should be filtered out
        }
      }
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle extremely long content', async () => {
      const veryLongContent = 'A'.repeat(2 * 1024 * 1024); // 2MB
      
      const dataWithLongContent = {
        ...mockChatGPTData,
        mapping: {
          'node1': {
            id: 'node1',
            message: {
              id: 'msg1',
              author: { role: 'user' },
              content: {
                content_type: 'text',
                parts: [veryLongContent]
              },
              create_time: 1640995200
            },
            parent: null,
            children: []
          }
        }
      };

      const result = await parser.parseChatGPT(JSON.stringify(dataWithLongContent));
      expect(result.messages[0].content.length).toBeLessThanOrEqual(1024 * 1024); // Should be truncated
    });

    it('should validate timestamp ranges', async () => {
      const invalidTimestamps = [-1, 0, Date.now() / 1000 + 100000]; // Negative, zero, far future
      
      for (const timestamp of invalidTimestamps) {
        const dataWithInvalidTime = {
          ...mockChatGPTData,
          mapping: {
            'node1': {
              id: 'node1',
              message: {
                id: 'msg1',
                author: { role: 'user' },
                content: {
                  content_type: 'text',
                  parts: ['Test message']
                },
                create_time: timestamp
              },
              parent: null,
              children: []
            }
          }
        };

        const result = await parser.parseChatGPT(JSON.stringify(dataWithInvalidTime));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });
  });
});