/**
 * Comprehensive tests for Gemini parser with malformed input edge cases
 * Covers security constraints and input validation requirements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiParser } from '../lib/parsers/gemini';
import { CryptoService } from '../lib/crypto';

describe('GeminiParser', () => {
  let parser: GeminiParser;
  let crypto: CryptoService;

  beforeEach(async () => {
    crypto = CryptoService.getInstance();
    await crypto.initializeEncryption('test-password');
    parser = new GeminiParser();
  });

  const mockGeminiStandardData = {
    conversations: [
      {
        conversation_id: 'gemini-conv-123',
        conversation_title: 'Test Gemini Conversation',
        create_time: '2024-01-15T10:30:00.000Z',
        update_time: '2024-01-15T11:45:00.000Z',
        messages: [
          {
            id: 'msg-1',
            author: {
              name: 'user',
              email: 'user@example.com'
            },
            create_time: '2024-01-15T10:30:00.000Z',
            text: 'Hello Gemini, how are you today?',
            message_type: 'user_message'
          },
          {
            id: 'msg-2',
            author: {
              name: 'model'
            },
            create_time: '2024-01-15T10:30:30.000Z',
            text: 'Hello! I\'m doing well, thank you for asking. How can I help you today?',
            message_type: 'model_response'
          }
        ]
      }
    ]
  };

  const mockGeminiTakeoutData = {
    id: 'takeout-conv-123',
    name: 'Test Takeout Conversation',
    created_date: '2024-01-15T10:30:00.000Z',
    updated_date: '2024-01-15T11:45:00.000Z',
    messages: [
      {
        creator: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        created_date: '2024-01-15T10:30:00.000Z',
        content: 'Hello Gemini, can you help me with coding?',
        message_id: 'takeout-msg-1'
      },
      {
        creator: {
          name: 'Gemini'
        },
        created_date: '2024-01-15T10:30:30.000Z',
        content: 'Of course! I\'d be happy to help you with coding. What specific programming task are you working on?',
        message_id: 'takeout-msg-2'
      }
    ]
  };

  describe('File Validation', () => {
    it('should validate valid Gemini standard format', () => {
      const result = parser.validateGeminiFile(JSON.stringify(mockGeminiStandardData));
      expect(result.isValid).toBe(true);
    });

    it('should validate valid Gemini Takeout format', () => {
      const result = parser.validateGeminiFile(JSON.stringify(mockGeminiTakeoutData));
      expect(result.isValid).toBe(true);
    });

    it('should validate array of Takeout conversations', () => {
      const arrayData = [mockGeminiTakeoutData, { ...mockGeminiTakeoutData, id: 'takeout-conv-456' }];
      const result = parser.validateGeminiFile(JSON.stringify(arrayData));
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid JSON', () => {
      const result = parser.validateGeminiFile('invalid json');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should reject empty files', () => {
      const result = parser.validateGeminiFile('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Empty file');
    });

    it('should reject files that are too large', () => {
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // >100MB
      const result = parser.validateGeminiFile(largeContent);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File too large (>100MB)');
    });

    it('should reject unrecognized format', () => {
      const invalidFormat = { some: 'random', data: 'structure' };
      const result = parser.validateGeminiFile(JSON.stringify(invalidFormat));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Not a valid Gemini format');
    });

    it('should reject missing required fields in standard format', () => {
      const testCases = [
        { ...mockGeminiStandardData, conversations: undefined },
        { ...mockGeminiStandardData, conversations: null },
        { ...mockGeminiStandardData, conversations: 'not an array' },
        { 
          conversations: [
            { ...mockGeminiStandardData.conversations[0], conversation_id: undefined }
          ]
        },
        { 
          conversations: [
            { ...mockGeminiStandardData.conversations[0], create_time: null }
          ]
        },
        { 
          conversations: [
            { ...mockGeminiStandardData.conversations[0], messages: undefined }
          ]
        },
      ];

      for (const invalidData of testCases) {
        const result = parser.validateGeminiFile(JSON.stringify(invalidData));
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should reject missing required fields in Takeout format', () => {
      const testCases = [
        { ...mockGeminiTakeoutData, id: undefined },
        { ...mockGeminiTakeoutData, created_date: null },
        { ...mockGeminiTakeoutData, messages: undefined },
        { ...mockGeminiTakeoutData, messages: 'not an array' },
      ];

      for (const invalidData of testCases) {
        const result = parser.validateGeminiFile(JSON.stringify(invalidData));
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should reject too many conversations', () => {
      const manyConversations = {
        conversations: Array(10001).fill(mockGeminiStandardData.conversations[0])
      };
      const result = parser.validateGeminiFile(JSON.stringify(manyConversations));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many conversations (>10,000)');
    });

    it('should reject too many messages', () => {
      const manyMessages = Array(100001).fill(mockGeminiStandardData.conversations[0].messages[0]);
      const invalidData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: manyMessages
        }]
      };
      
      const result = parser.validateGeminiFile(JSON.stringify(invalidData));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many messages (>100,000)');
    });
  });

  describe('Parsing Standard Format', () => {
    it('should parse Gemini standard conversation correctly', async () => {
      const result = await parser.parseGemini(JSON.stringify(mockGeminiStandardData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const conversation = result.conversations[0];
      expect(conversation.id).toBe('gemini-conv-123');
      expect(conversation.display_name).toBe('Test Gemini Conversation');
      expect(conversation.source_app).toBe('Google Gemini');
      expect(conversation.chat_type).toBe('llm');

      const messages = result.messages;
      expect(messages[0].author).toBe('User');
      expect(messages[0].content).toBe('Hello Gemini, how are you today?');
      expect(messages[1].author).toBe('Gemini');
      expect(messages[1].content).toBe('Hello! I\'m doing well, thank you for asking. How can I help you today?');
    });

    it('should handle multiple conversations in standard format', async () => {
      const multipleConversations = {
        conversations: [
          mockGeminiStandardData.conversations[0],
          { ...mockGeminiStandardData.conversations[0], conversation_id: 'gemini-conv-456' }
        ]
      };
      
      const result = await parser.parseGemini(JSON.stringify(multipleConversations));
      
      expect(result.conversations).toHaveLength(2);
      expect(result.messages).toHaveLength(4);
    });

    it('should use fallback display name when title is missing', async () => {
      const dataWithoutTitle = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          conversation_title: undefined
        }]
      };
      
      const result = await parser.parseGemini(JSON.stringify(dataWithoutTitle));
      expect(result.conversations[0].display_name).toBe('Untitled Gemini Chat');
    });
  });

  describe('Parsing Takeout Format', () => {
    it('should parse Gemini Takeout conversation correctly', async () => {
      const result = await parser.parseGemini(JSON.stringify(mockGeminiTakeoutData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const conversation = result.conversations[0];
      expect(conversation.id).toBe('takeout-conv-123');
      expect(conversation.display_name).toBe('Test Takeout Conversation');
      expect(conversation.source_app).toBe('Google Gemini');
      expect(conversation.chat_type).toBe('llm');

      const messages = result.messages;
      expect(messages[0].author).toBe('User');
      expect(messages[0].content).toBe('Hello Gemini, can you help me with coding?');
      expect(messages[1].author).toBe('Gemini');
      expect(messages[1].content).toBe('Of course! I\'d be happy to help you with coding. What specific programming task are you working on?');
    });

    it('should handle array of Takeout conversations', async () => {
      const arrayData = [mockGeminiTakeoutData, { ...mockGeminiTakeoutData, id: 'takeout-conv-456' }];
      const result = await parser.parseGemini(JSON.stringify(arrayData));
      
      expect(result.conversations).toHaveLength(2);
      expect(result.messages).toHaveLength(4);
    });
  });

  describe('Author Role Mapping', () => {
    it('should map various user role names correctly', async () => {
      const userRoleVariants = ['user', 'human', 'User', 'HUMAN', 'you'];
      
      for (const roleName of userRoleVariants) {
        const testData = {
          conversations: [{
            ...mockGeminiStandardData.conversations[0],
            messages: [{
              ...mockGeminiStandardData.conversations[0].messages[0],
              author: { name: roleName }
            }]
          }]
        };

        const result = await parser.parseGemini(JSON.stringify(testData));
        expect(result.messages[0].author).toBe('User');
      }
    });

    it('should map various AI role names correctly', async () => {
      const aiRoleVariants = ['model', 'gemini', 'bard', 'assistant', 'ai', 'Gemini', 'BARD'];
      
      for (const roleName of aiRoleVariants) {
        const testData = {
          conversations: [{
            ...mockGeminiStandardData.conversations[0],
            messages: [{
              ...mockGeminiStandardData.conversations[0].messages[0],
              author: { name: roleName }
            }]
          }]
        };

        const result = await parser.parseGemini(JSON.stringify(testData));
        expect(result.messages[0].author).toBe('Gemini');
      }
    });

    it('should preserve custom author names', async () => {
      const customName = 'Custom Assistant';
      const testData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: [{
            ...mockGeminiStandardData.conversations[0].messages[0],
            author: { name: customName }
          }]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(testData));
      expect(result.messages[0].author).toBe(customName);
    });
  });

  describe('Timestamp Parsing', () => {
    it('should parse valid ISO 8601 timestamps', async () => {
      const result = await parser.parseGemini(JSON.stringify(mockGeminiStandardData));
      
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
          conversations: [{
            ...mockGeminiStandardData.conversations[0],
            messages: [{
              ...mockGeminiStandardData.conversations[0].messages[0],
              create_time: timestamp
            }]
          }]
        };

        const result = await parser.parseGemini(JSON.stringify(testData));
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
          conversations: [{
            ...mockGeminiStandardData.conversations[0],
            messages: [{
              ...mockGeminiStandardData.conversations[0].messages[0],
              create_time: timestamp
            }]
          }]
        };

        const result = await parser.parseGemini(JSON.stringify(testData));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });

    it('should calculate conversation time bounds correctly', async () => {
      const result = await parser.parseGemini(JSON.stringify(mockGeminiStandardData));
      const conversation = result.conversations[0];
      
      // Should use the earliest message time as start_time
      expect(conversation.start_time).toBe(1705316200); // 2024-01-15T10:30:00.000Z
      expect(conversation.end_time).toBe(1705320300); // 2024-01-15T11:45:00.000Z (update_time)
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
        'print("Hello World")',
        'console.log("Debug message");',
      ];

      for (const codeContent of codePatterns) {
        const codeData = {
          conversations: [{
            ...mockGeminiStandardData.conversations[0],
            messages: [{
              ...mockGeminiStandardData.conversations[0].messages[0],
              text: codeContent
            }]
          }]
        };

        const result = await parser.parseGemini(JSON.stringify(codeData));
        expect(result.messages[0].content_type).toBe('code');
      }
    });

    it('should detect text content for regular messages', async () => {
      const textContent = 'This is just a regular conversation message without any code.';
      
      const textData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: [{
            ...mockGeminiStandardData.conversations[0].messages[0],
            text: textContent
          }]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(textData));
      expect(result.messages[0].content_type).toBe('text');
    });
  });

  describe('Malformed Input Handling', () => {
    it('should handle malformed standard messages gracefully', async () => {
      const malformedData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: [
            null, // Null message
            'invalid', // String instead of object
            {}, // Empty object
            { id: 'msg-1' }, // Missing required fields
            {
              id: 'msg-2',
              author: { name: 'user' },
              create_time: '2024-01-15T10:30:00.000Z',
              text: ''
            }, // Empty text
            {
              id: 'msg-3',
              author: { name: 'user' },
              create_time: 'invalid-date',
              text: 'Valid text'
            }, // Invalid timestamp
            {
              id: 'msg-4',
              author: { name: 'user' },
              create_time: '2024-01-15T10:30:00.000Z',
              text: 'Valid message'
            } // This should be the only valid message
          ]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(malformedData));
      expect(result.messages).toHaveLength(1); // Only the last valid message
      expect(result.messages[0].content).toBe('Valid message');
    });

    it('should handle malformed Takeout messages gracefully', async () => {
      const malformedData = {
        ...mockGeminiTakeoutData,
        messages: [
          null, // Null message
          'invalid', // String instead of object
          {}, // Empty object
          { message_id: 'msg-1' }, // Missing required fields
          {
            creator: { name: 'user' },
            created_date: '2024-01-15T10:30:00.000Z',
            content: ''
          }, // Empty content
          {
            creator: { name: 'user' },
            created_date: 'invalid-date',
            content: 'Valid content'
          }, // Invalid timestamp
          {
            creator: { name: 'user' },
            created_date: '2024-01-15T10:30:00.000Z',
            content: 'Valid message'
          } // This should be the only valid message
        ]
      };

      const result = await parser.parseGemini(JSON.stringify(malformedData));
      expect(result.messages).toHaveLength(1); // Only the last valid message
      expect(result.messages[0].content).toBe('Valid message');
    });

    it('should sanitize dangerous content', async () => {
      const dangerousData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          conversation_title: 'Chat with \x00null\x01bytes\x1F',
          messages: [{
            id: 'msg-1',
            author: { name: 'user' },
            create_time: '2024-01-15T10:30:00.000Z',
            text: 'Message with \x00dangerous\x01control\x1Fcharacters'
          }]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(dangerousData));
      
      expect(result.conversations[0].display_name).not.toContain('\x00');
      expect(result.conversations[0].display_name).not.toContain('\x01');
      expect(result.messages[0].content).not.toContain('\x00');
      expect(result.messages[0].content).not.toContain('\x01');
    });

    it('should handle extremely large conversations', async () => {
      const largeMessages = Array(60000).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        author: { name: i % 2 === 0 ? 'user' : 'model' },
        create_time: '2024-01-15T10:30:00.000Z',
        text: `Message ${i}`
      }));

      const largeData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: largeMessages
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(largeData));
      expect(result.errors).toContain('Conversation too large (>50,000 messages)');
    });

    it('should handle extremely long content', async () => {
      const veryLongContent = 'A'.repeat(2 * 1024 * 1024); // 2MB
      
      const dataWithLongContent = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: [{
            id: 'msg-1',
            author: { name: 'user' },
            create_time: '2024-01-15T10:30:00.000Z',
            text: veryLongContent
          }]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(dataWithLongContent));
      expect(result.messages[0].content.length).toBeLessThanOrEqual(1024 * 1024); // Should be truncated
    });

    it('should handle invalid author structures', async () => {
      const invalidAuthors = [null, undefined, 'string', 123, [], { name: null }, { name: undefined }];
      
      for (const author of invalidAuthors) {
        const dataWithInvalidAuthor = {
          conversations: [{
            ...mockGeminiStandardData.conversations[0],
            messages: [{
              id: 'msg-1',
              author: author,
              create_time: '2024-01-15T10:30:00.000Z',
              text: 'Test message'
            }]
          }]
        };

        const result = await parser.parseGemini(JSON.stringify(dataWithInvalidAuthor));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });
  });

  describe('Encoding Edge Cases', () => {
    it('should handle Unicode characters correctly', async () => {
      const unicodeContent = 'Hello 🌍! This is a test with émojis and spëcial characters: 中文, العربية, русский';
      
      const unicodeData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          conversation_title: 'Unicode Test 🚀',
          messages: [{
            id: 'msg-1',
            author: { name: 'user' },
            create_time: '2024-01-15T10:30:00.000Z',
            text: unicodeContent
          }]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(unicodeData));
      
      expect(result.conversations[0].display_name).toBe('Unicode Test 🚀');
      expect(result.messages[0].content).toBe(unicodeContent);
    });

    it('should handle mixed encoding scenarios', async () => {
      const mixedContent = 'Regular text with\nnewlines\tand\ttabs, plus Unicode: 🔐 and special chars: ñáéíóú';
      
      const mixedData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: [{
            id: 'msg-1',
            author: { name: 'user' },
            create_time: '2024-01-15T10:30:00.000Z',
            text: mixedContent
          }]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(mixedData));
      expect(result.messages[0].content).toContain('🔐');
      expect(result.messages[0].content).toContain('ñáéíóú');
      expect(result.messages[0].content).toContain('\n');
      expect(result.messages[0].content).toContain('\t');
    });
  });

  describe('Incomplete Thread Handling', () => {
    it('should handle conversations with missing messages', async () => {
      const incompleteData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: []
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(incompleteData));
      expect(result.conversations).toHaveLength(0); // Should be filtered out
      expect(result.errors).toContain('No valid messages found in conversation');
    });

    it('should handle partial conversation threads', async () => {
      const partialData = {
        conversations: [{
          ...mockGeminiStandardData.conversations[0],
          messages: [
            // Only user message, no AI response
            mockGeminiStandardData.conversations[0].messages[0]
          ]
        }]
      };

      const result = await parser.parseGemini(JSON.stringify(partialData));
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].author).toBe('User');
    });
  });
});