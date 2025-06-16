/**
 * Comprehensive tests for Qwen parser with encoding and multi-language edge cases
 * Covers security constraints and input validation requirements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QwenParser } from '../lib/parsers/qwen';
import { CryptoService } from '../lib/crypto';

describe('QwenParser', () => {
  let parser: QwenParser;
  let crypto: CryptoService;

  beforeEach(async () => {
    crypto = CryptoService.getInstance();
    await crypto.initializeEncryption('test-password');
    parser = new QwenParser();
  });

  const mockQwenJSONData = {
    conversation_id: 'qwen-conv-123',
    title: 'Test Qwen Conversation',
    created_time: '2024-01-15T10:30:00.000Z',
    updated_time: '2024-01-15T11:45:00.000Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello Qwen, how are you today?',
        timestamp: '2024-01-15T10:30:00.000Z',
        type: 'text'
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hello! I\'m doing well, thank you for asking. How can I help you today?',
        timestamp: '2024-01-15T10:30:30.000Z',
        type: 'text'
      }
    ]
  };

  const mockQwenAlternativeJSONData = {
    session_id: 'qwen-session-456',
    name: 'Alternative Qwen Chat',
    created_time: 1705316200,
    updated_time: 1705320300,
    chat_history: [
      {
        message_id: 'alt-msg-1',
        sender: 'human',
        text: 'Can you help me with coding?',
        time: 1705316200
      },
      {
        message_id: 'alt-msg-2',
        sender: 'qwen',
        text: 'Of course! I\'d be happy to help you with coding. What programming language are you working with?',
        time: 1705316230
      }
    ]
  };

  const mockQwenTextLogData = `2024-01-15 10:30:00 user: Hello Qwen, can you help me with Python?
2024-01-15 10:30:30 assistant: Hello! I'd be happy to help you with Python programming. What specific topic would you like to learn about?
2024-01-15 10:31:00 user: I need help with loops
2024-01-15 10:31:30 assistant: Great! Python has several types of loops. Let me explain for loops first:

for i in range(5):
    print(i)

This will print numbers 0 through 4.`;

  const mockQwenChineseData = {
    conversation_id: 'qwen-chinese-123',
    title: '与通义千问的对话',
    created_time: '2024-01-15T10:30:00.000Z',
    updated_time: '2024-01-15T11:45:00.000Z',
    messages: [
      {
        id: 'msg-1',
        role: '用户',
        content: '你好，通义千问！你能帮我写一个Python函数吗？',
        timestamp: '2024-01-15T10:30:00.000Z'
      },
      {
        id: 'msg-2',
        role: '助手',
        content: '你好！我很乐意帮你写Python函数。请告诉我你需要什么样的函数？',
        timestamp: '2024-01-15T10:30:30.000Z'
      }
    ]
  };

  describe('File Validation', () => {
    it('should validate valid Qwen JSON format', () => {
      const result = parser.validateQwenFile(JSON.stringify(mockQwenJSONData));
      expect(result.isValid).toBe(true);
    });

    it('should validate alternative Qwen JSON format', () => {
      const result = parser.validateQwenFile(JSON.stringify(mockQwenAlternativeJSONData));
      expect(result.isValid).toBe(true);
    });

    it('should validate Qwen text log format', () => {
      const result = parser.validateQwenFile(mockQwenTextLogData);
      expect(result.isValid).toBe(true);
    });

    it('should validate Chinese content', () => {
      const result = parser.validateQwenFile(JSON.stringify(mockQwenChineseData));
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid JSON', () => {
      const result = parser.validateQwenFile('invalid json');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Not a valid Qwen format');
    });

    it('should reject empty files', () => {
      const result = parser.validateQwenFile('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Empty file');
    });

    it('should reject files that are too large', () => {
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // >100MB
      const result = parser.validateQwenFile(largeContent);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File too large (>100MB)');
    });

    it('should reject too many conversations', () => {
      const manyConversations = Array(10001).fill(mockQwenJSONData);
      const result = parser.validateQwenFile(JSON.stringify(manyConversations));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many conversations (>10,000)');
    });

    it('should reject too many messages', () => {
      const manyMessages = Array(100001).fill(mockQwenJSONData.messages[0]);
      const invalidData = {
        ...mockQwenJSONData,
        messages: manyMessages
      };
      
      const result = parser.validateQwenFile(JSON.stringify(invalidData));
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many messages (>100,000)');
    });

    it('should reject too many text log lines', () => {
      const manyLines = Array(100001).fill('2024-01-15 10:30:00 user: test').join('\n');
      const result = parser.validateQwenFile(manyLines);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Text log too large (>100,000 lines)');
    });
  });

  describe('Encoding Normalization', () => {
    it('should handle BOM removal', async () => {
      const contentWithBOM = '\uFEFF' + JSON.stringify(mockQwenJSONData);
      const result = await parser.parseQwen(contentWithBOM);
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle common encoding issues', async () => {
      const contentWithEncodingIssues = JSON.stringify(mockQwenJSONData)
        .replace(/'/g, 'â€™')  // Simulate mojibake
        .replace(/"/g, 'â€œ')
        .replace(/"/g, 'â€');
      
      const result = await parser.parseQwen(contentWithEncodingIssues);
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      // Content should be normalized
      expect(result.messages[0].content).toContain(''');
      )
      expect(result.messages[0].content).toContain('"');
    });

    it('should handle Chinese characters correctly', async () => {
      const result = await parser.parseQwen(JSON.stringify(mockQwenChineseData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.conversations[0].display_name).toBe('与通义千问的对话');
      expect(result.messages[0].content).toContain('通义千问');
      expect(result.messages[0].content).toContain('Python函数');
    });

    it('should handle mixed language content', async () => {
      const mixedData = {
        ...mockQwenJSONData,
        title: 'Mixed Language: English and 中文',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello! Can you help me? 你好！你能帮助我吗？',
            timestamp: '2024-01-15T10:30:00.000Z'
          }
        ]
      };

      const result = await parser.parseQwen(JSON.stringify(mixedData));
      
      expect(result.conversations[0].display_name).toBe('Mixed Language: English and 中文');
      expect(result.messages[0].content).toContain('Hello!');
      expect(result.messages[0].content).toContain('你好！');
    });

    it('should handle Unicode normalization', async () => {
      const unicodeData = {
        ...mockQwenJSONData,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Café naïve résumé 🚀 emoji test',
            timestamp: '2024-01-15T10:30:00.000Z'
          }
        ]
      };

      const result = await parser.parseQwen(JSON.stringify(unicodeData));
      
      expect(result.messages[0].content).toBe('Café naïve résumé 🚀 emoji test');
    });
  });

  describe('JSON Format Parsing', () => {
    it('should parse standard Qwen JSON correctly', async () => {
      const result = await parser.parseQwen(JSON.stringify(mockQwenJSONData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const conversation = result.conversations[0];
      expect(conversation.id).toBe('qwen-conv-123');
      expect(conversation.display_name).toBe('Test Qwen Conversation');
      expect(conversation.source_app).toBe('Qwen');
      expect(conversation.chat_type).toBe('llm');

      const messages = result.messages;
      expect(messages[0].author).toBe('User');
      expect(messages[0].content).toBe('Hello Qwen, how are you today?');
      expect(messages[1].author).toBe('Qwen');
      expect(messages[1].content).toBe('Hello! I\'m doing well, thank you for asking. How can I help you today?');
    });

    it('should parse alternative JSON format with chat_history', async () => {
      const result = await parser.parseQwen(JSON.stringify(mockQwenAlternativeJSONData));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(2);
      expect(result.conversations[0].display_name).toBe('Alternative Qwen Chat');
      expect(result.messages[0].author).toBe('User');
      expect(result.messages[1].author).toBe('Qwen');
    });

    it('should handle array of conversations', async () => {
      const arrayData = [mockQwenJSONData, mockQwenAlternativeJSONData];
      const result = await parser.parseQwen(JSON.stringify(arrayData));
      
      expect(result.conversations).toHaveLength(2);
      expect(result.messages).toHaveLength(4);
    });

    it('should generate conversation ID when missing', async () => {
      const dataWithoutId = {
        title: 'No ID Conversation',
        messages: mockQwenJSONData.messages
      };

      const result = await parser.parseQwen(JSON.stringify(dataWithoutId));
      
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toMatch(/^qwen-\d+-[a-z0-9]+$/);
    });

    it('should use fallback display name', async () => {
      const dataWithoutTitle = {
        conversation_id: 'test-123',
        messages: mockQwenJSONData.messages
      };

      const result = await parser.parseQwen(JSON.stringify(dataWithoutTitle));
      
      expect(result.conversations[0].display_name).toBe('Untitled Qwen Chat');
    });
  });

  describe('Text Log Format Parsing', () => {
    it('should parse text log format correctly', async () => {
      const result = await parser.parseQwen(mockQwenTextLogData);
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(4);
      expect(result.conversations[0].source_app).toBe('Qwen');
      expect(result.conversations[0].display_name).toBe('Qwen Text Log Import');
      expect(result.conversations[0].tags).toContain('text-log');
    });

    it('should handle different text log patterns', async () => {
      const patterns = [
        '[2024-01-15 10:30:00] user: Hello with brackets',
        'user (2024-01-15 10:30:00): Hello with parentheses',
        'user: 2024-01-15 10:30:00 Hello with colon first',
        '2024-01-15 10:30:00 assistant: Standard format'
      ];

      for (const pattern of patterns) {
        const result = await parser.parseQwen(pattern);
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].content).toContain('Hello');
      }
    });

    it('should handle multi-line messages in text logs', async () => {
      const multiLineLog = `2024-01-15 10:30:00 user: This is a multi-line message
that continues on the next line
and even more lines
2024-01-15 10:30:30 assistant: This is the response`;

      const result = await parser.parseQwen(multiLineLog);
      
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toContain('multi-line message\nthat continues');
      expect(result.messages[1].content).toBe('This is the response');
    });

    it('should handle Chinese roles in text logs', async () => {
      const chineseLog = `2024-01-15 10:30:00 用户: 你好
2024-01-15 10:30:30 助手: 你好！`;

      const result = await parser.parseQwen(chineseLog);
      
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].author).toBe('User');
      expect(result.messages[1].author).toBe('Qwen');
    });
  });

  describe('Role Mapping', () => {
    it('should map user roles correctly', async () => {
      const userRoles = ['user', 'human', 'person', '用户', '人类'];
      
      for (const role of userRoles) {
        const testData = {
          ...mockQwenJSONData,
          messages: [{
            id: 'test',
            role: role,
            content: 'Test message',
            timestamp: '2024-01-15T10:30:00.000Z'
          }]
        };

        const result = await parser.parseQwen(JSON.stringify(testData));
        expect(result.messages[0].author).toBe('User');
      }
    });

    it('should map AI roles correctly', async () => {
      const aiRoles = ['assistant', 'qwen', 'ai', 'model', 'bot', 'system', '助手', '通义千问', '千问'];
      
      for (const role of aiRoles) {
        const testData = {
          ...mockQwenJSONData,
          messages: [{
            id: 'test',
            role: role,
            content: 'Test message',
            timestamp: '2024-01-15T10:30:00.000Z'
          }]
        };

        const result = await parser.parseQwen(JSON.stringify(testData));
        expect(result.messages[0].author).toBe('Qwen');
      }
    });

    it('should preserve custom role names', async () => {
      const customRole = 'Custom Assistant';
      const testData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: customRole,
          content: 'Test message',
          timestamp: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(testData));
      expect(result.messages[0].author).toBe(customRole);
    });
  });

  describe('Timestamp Parsing', () => {
    it('should parse ISO 8601 timestamps', async () => {
      const result = await parser.parseQwen(JSON.stringify(mockQwenJSONData));
      
      expect(result.messages[0].timestamp_utc).toBe(1705316200); // 2024-01-15T10:30:00.000Z
      expect(result.messages[1].timestamp_utc).toBe(1705316230); // 2024-01-15T10:30:30.000Z
    });

    it('should parse Unix timestamps', async () => {
      const unixData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: 'user',
          content: 'Test message',
          timestamp: 1705316200
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(unixData));
      expect(result.messages[0].timestamp_utc).toBe(1705316200);
    });

    it('should parse Unix millisecond timestamps', async () => {
      const millisData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: 'user',
          content: 'Test message',
          timestamp: 1705316200000 // Milliseconds
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(millisData));
      expect(result.messages[0].timestamp_utc).toBe(1705316200); // Should convert to seconds
    });

    it('should handle string numeric timestamps', async () => {
      const stringNumericData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: 'user',
          content: 'Test message',
          timestamp: '1705316200'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(stringNumericData));
      expect(result.messages[0].timestamp_utc).toBe(1705316200);
    });

    it('should use fallback for invalid timestamps', async () => {
      const invalidTimestampData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: 'user',
          content: 'Test message',
          timestamp: 'invalid-timestamp'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(invalidTimestampData));
      expect(result.messages[0].timestamp_utc).toBeGreaterThan(Date.now() / 1000 - 60); // Within last minute
    });

    it('should handle missing timestamps', async () => {
      const noTimestampData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: 'user',
          content: 'Test message'
          // No timestamp field
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(noTimestampData));
      expect(result.messages[0].timestamp_utc).toBeGreaterThan(Date.now() / 1000 - 60); // Within last minute
    });
  });

  describe('Content Type Detection', () => {
    it('should detect code content from patterns', async () => {
      const codePatterns = [
        'Here\'s a Python function:\n```python\ndef hello():\n    print("Hello")\n```',
        'Use `pip install` to install packages',
        'function test() {\n  return true;\n}',
        '// This is a comment\nconst x = 5;',
        'SELECT * FROM users WHERE id = 1;',
        'print("Hello World")',
        'console.log("Debug message");',
        '函数定义如下：\ndef 你好():\n    print("你好世界")', // Chinese code
      ];

      for (const codeContent of codePatterns) {
        const codeData = {
          ...mockQwenJSONData,
          messages: [{
            id: 'test',
            role: 'user',
            content: codeContent,
            timestamp: '2024-01-15T10:30:00.000Z'
          }]
        };

        const result = await parser.parseQwen(JSON.stringify(codeData));
        expect(result.messages[0].content_type).toBe('code');
      }
    });

    it('should detect text content for regular messages', async () => {
      const textContent = 'This is just a regular conversation message without any code.';
      
      const textData = {
        ...mockQwenJSONData,
        messages: [{
          id: 'test',
          role: 'user',
          content: textContent,
          timestamp: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(textData));
      expect(result.messages[0].content_type).toBe('text');
    });
  });

  describe('Malformed Input Handling', () => {
    it('should handle malformed JSON messages gracefully', async () => {
      const malformedData = {
        ...mockQwenJSONData,
        messages: [
          null, // Null message
          'invalid', // String instead of object
          {}, // Empty object
          { id: 'msg-1' }, // Missing required fields
          {
            id: 'msg-2',
            role: 'user',
            content: '',
            timestamp: '2024-01-15T10:30:00.000Z'
          }, // Empty content
          {
            id: 'msg-3',
            role: 'user',
            content: 'Valid message',
            timestamp: '2024-01-15T10:30:00.000Z'
          } // This should be the only valid message
        ]
      };

      const result = await parser.parseQwen(JSON.stringify(malformedData));
      expect(result.messages).toHaveLength(1); // Only the last valid message
      expect(result.messages[0].content).toBe('Valid message');
    });

    it('should sanitize dangerous content', async () => {
      const dangerousData = {
        ...mockQwenJSONData,
        title: 'Chat with \x00null\x01bytes\x1F',
        messages: [{
          id: 'msg-1',
          role: 'user',
          content: 'Message with \x00dangerous\x01control\x1Fcharacters',
          timestamp: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(dangerousData));
      
      expect(result.conversations[0].display_name).not.toContain('\x00');
      expect(result.conversations[0].display_name).not.toContain('\x01');
      expect(result.messages[0].content).not.toContain('\x00');
      expect(result.messages[0].content).not.toContain('\x01');
    });

    it('should handle extremely large conversations', async () => {
      const largeMessages = Array(60000).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: '2024-01-15T10:30:00.000Z'
      }));

      const largeData = {
        ...mockQwenJSONData,
        messages: largeMessages
      };

      const result = await parser.parseQwen(JSON.stringify(largeData));
      expect(result.errors).toContain('Conversation too large (>50,000 messages)');
    });

    it('should handle extremely long content', async () => {
      const veryLongContent = 'A'.repeat(2 * 1024 * 1024); // 2MB
      
      const dataWithLongContent = {
        ...mockQwenJSONData,
        messages: [{
          id: 'msg-1',
          role: 'user',
          content: veryLongContent,
          timestamp: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(dataWithLongContent));
      expect(result.messages[0].content.length).toBeLessThanOrEqual(1024 * 1024); // Should be truncated
    });

    it('should handle invalid role types', async () => {
      const invalidRoles = [null, undefined, 123, {}, []];
      
      for (const role of invalidRoles) {
        const dataWithInvalidRole = {
          ...mockQwenJSONData,
          messages: [{
            id: 'msg-1',
            role: role,
            content: 'Test message',
            timestamp: '2024-01-15T10:30:00.000Z'
          }]
        };

        const result = await parser.parseQwen(JSON.stringify(dataWithInvalidRole));
        expect(result.messages).toHaveLength(0); // Should be filtered out
      }
    });

    it('should handle malformed text log lines', async () => {
      const malformedLog = `2024-01-15 10:30:00 user: Valid line
invalid line without timestamp
another invalid line
2024-01-15 10:30:30 assistant: Another valid line`;

      const result = await parser.parseQwen(malformedLog);
      
      expect(result.messages).toHaveLength(2); // Only valid lines
      expect(result.messages[0].content).toBe('Valid line');
      expect(result.messages[1].content).toBe('Another valid line');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty conversations', async () => {
      const emptyData = {
        conversation_id: 'empty-conv',
        messages: []
      };

      const result = await parser.parseQwen(JSON.stringify(emptyData));
      expect(result.conversations).toHaveLength(0); // Should be filtered out
      expect(result.errors).toContain('No valid messages found in conversation');
    });

    it('should handle conversations with only invalid messages', async () => {
      const invalidMessagesData = {
        conversation_id: 'invalid-conv',
        messages: [
          { id: 'msg-1' }, // Missing role and content
          { role: 'user' }, // Missing content
          { content: 'No role' } // Missing role
        ]
      };

      const result = await parser.parseQwen(JSON.stringify(invalidMessagesData));
      expect(result.conversations).toHaveLength(0); // Should be filtered out
      expect(result.errors).toContain('No valid messages found in conversation');
    });

    it('should handle text logs with no valid entries', async () => {
      const invalidLog = `This is not a valid log format
Just some random text
No timestamps or roles here`;

      const result = await parser.parseQwen(invalidLog);
      expect(result.conversations).toHaveLength(0);
      expect(result.errors).toContain('No valid log entries found');
    });

    it('should handle mixed valid and invalid conversations', async () => {
      const mixedData = [
        mockQwenJSONData, // Valid
        { invalid: 'conversation' }, // Invalid
        mockQwenAlternativeJSONData // Valid
      ];

      const result = await parser.parseQwen(JSON.stringify(mixedData));
      expect(result.conversations).toHaveLength(2); // Only valid ones
      expect(result.messages).toHaveLength(4);
      expect(result.errors.length).toBeGreaterThan(0); // Should have error for invalid conversation
    });
  });

  describe('Unicode and Encoding Edge Cases', () => {
    it('should handle surrogate pairs correctly', async () => {
      const surrogateData = {
        ...mockQwenJSONData,
        title: 'Test with emoji 🚀🌟💫',
        messages: [{
          id: 'msg-1',
          role: 'user',
          content: 'Message with emojis: 🎉🎊🎈 and Chinese: 你好世界',
          timestamp: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(surrogateData));
      
      expect(result.conversations[0].display_name).toContain('🚀🌟💫');
      expect(result.messages[0].content).toContain('🎉🎊🎈');
      expect(result.messages[0].content).toContain('你好世界');
    });

    it('should handle content length limits with multi-byte characters', async () => {
      // Create content that's exactly at the limit with multi-byte characters
      const chineseChar = '中'; // 3 bytes in UTF-8
      const longChineseContent = chineseChar.repeat(300000); // Should be truncated

      const dataWithLongChinese = {
        ...mockQwenJSONData,
        messages: [{
          id: 'msg-1',
          role: 'user',
          content: longChineseContent,
          timestamp: '2024-01-15T10:30:00.000Z'
        }]
      };

      const result = await parser.parseQwen(JSON.stringify(dataWithLongChinese));
      expect(result.messages[0].content.length).toBeLessThanOrEqual(1024 * 1024);
      // Should not cut in the middle of a character
      expect(result.messages[0].content).not.toContain('\uFFFD'); // No replacement characters
    });
  });
});