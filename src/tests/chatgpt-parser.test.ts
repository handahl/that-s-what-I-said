/**
 * Tests for ChatGPT parser
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

  it('should validate valid ChatGPT file', () => {
    const result = parser.validateChatGPTFile(JSON.stringify(mockChatGPTData));
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid JSON', () => {
    const result = parser.validateChatGPTFile('invalid json');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('should reject missing required fields', () => {
    const invalidData = { ...mockChatGPTData };
    delete invalidData.conversation_id;
    
    const result = parser.validateChatGPTFile(JSON.stringify(invalidData));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('conversation_id');
  });

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

  it('should detect code content type', async () => {
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
              parts: ['Write a Python function:\n```python\ndef hello():\n    print("Hello")\n```']
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

  it('should calculate conversation time bounds correctly', async () => {
    const result = await parser.parseChatGPT(JSON.stringify(mockChatGPTData));
    const conversation = result.conversations[0];
    
    expect(conversation.start_time).toBe(1640995200);
    expect(conversation.end_time).toBe(1640995260);
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
        }
      }
    };

    const result = await parser.parseChatGPT(JSON.stringify(malformedData));
    expect(result.messages).toHaveLength(0); // Empty messages should be filtered out
  });
});