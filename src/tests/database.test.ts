/**
 * Tests for database service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../lib/database';
import { CryptoService } from '../lib/crypto';
import type { Conversation, ChatMessage } from '../lib/types';

// Mock Tauri plugin
const mockDb = {
  execute: vi.fn(),
  select: vi.fn(),
  close: vi.fn()
};

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(() => Promise.resolve(mockDb))
  }
}));

describe('DatabaseService', () => {
  let database: DatabaseService;
  let crypto: CryptoService;

  beforeEach(async () => {
    crypto = CryptoService.getInstance();
    await crypto.initializeEncryption('test-password');
    database = DatabaseService.getInstance();
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await database.close();
  });

  it('should initialize database with correct schema', async () => {
    await database.initializeDatabase();
    
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS conversations')
    );
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS messages')
    );
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE INDEX IF NOT EXISTS')
    );
  });

  it('should save conversation with encryption', async () => {
    await database.initializeDatabase();
    
    const conversation: Conversation = {
      id: 'test-conv-1',
      source_app: 'ChatGPT',
      chat_type: 'llm',
      display_name: 'Test Conversation',
      start_time: 1640995200,
      end_time: 1640995300,
      tags: ['test', 'example']
    };

    await database.saveConversation(conversation);
    
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO conversations'),
      expect.arrayContaining([
        'test-conv-1',
        'ChatGPT',
        'llm',
        expect.any(String), // encrypted display_name
        1640995200,
        1640995300,
        expect.any(String)  // encrypted tags
      ])
    );
  });

  it('should save messages in transaction', async () => {
    await database.initializeDatabase();
    
    const messages: ChatMessage[] = [
      {
        message_id: 'msg-1',
        conversation_id: 'conv-1',
        timestamp_utc: 1640995200,
        author: 'User',
        content: 'Hello',
        content_type: 'text'
      },
      {
        message_id: 'msg-2',
        conversation_id: 'conv-1',
        timestamp_utc: 1640995260,
        author: 'ChatGPT',
        content: 'Hi there!',
        content_type: 'text'
      }
    ];

    await database.saveMessages(messages);
    
    expect(mockDb.execute).toHaveBeenCalledWith('BEGIN TRANSACTION');
    expect(mockDb.execute).toHaveBeenCalledWith('COMMIT');
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO messages'),
      expect.any(Array)
    );
  });

  it('should rollback transaction on error', async () => {
    await database.initializeDatabase();
    
    // Mock an error during message insertion
    mockDb.execute.mockImplementation((query) => {
      if (query.includes('INSERT OR REPLACE INTO messages')) {
        throw new Error('Database error');
      }
      return Promise.resolve();
    });

    const messages: ChatMessage[] = [
      {
        message_id: 'msg-1',
        conversation_id: 'conv-1',
        timestamp_utc: 1640995200,
        author: 'User',
        content: 'Hello',
        content_type: 'text'
      }
    ];

    await expect(database.saveMessages(messages)).rejects.toThrow();
    expect(mockDb.execute).toHaveBeenCalledWith('ROLLBACK');
  });

  it('should retrieve and decrypt conversations', async () => {
    await database.initializeDatabase();
    
    const encryptedDisplayName = crypto.encrypt('Test Conversation');
    const encryptedTags = crypto.encrypt(JSON.stringify(['test']));
    
    mockDb.select.mockResolvedValue([
      {
        id: 'conv-1',
        source_app: 'ChatGPT',
        chat_type: 'llm',
        display_name: encryptedDisplayName,
        start_time: 1640995200,
        end_time: 1640995300,
        tags: encryptedTags
      }
    ]);

    const conversations = await database.getConversations();
    
    expect(conversations).toHaveLength(1);
    expect(conversations[0].display_name).toBe('Test Conversation');
    expect(conversations[0].tags).toEqual(['test']);
  });

  it('should retrieve and decrypt messages', async () => {
    await database.initializeDatabase();
    
    const encryptedAuthor = crypto.encrypt('User');
    const encryptedContent = crypto.encrypt('Hello, world!');
    
    mockDb.select.mockResolvedValue([
      {
        message_id: 'msg-1',
        conversation_id: 'conv-1',
        timestamp_utc: 1640995200,
        author: encryptedAuthor,
        content: encryptedContent,
        content_type: 'text'
      }
    ]);

    const messages = await database.getMessagesForConversation('conv-1');
    
    expect(messages).toHaveLength(1);
    expect(messages[0].author).toBe('User');
    expect(messages[0].content).toBe('Hello, world!');
  });

  it('should handle pagination correctly', async () => {
    await database.initializeDatabase();
    
    await database.getConversations('end_time', 25, 50);
    
    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT ? OFFSET ?'),
      [25, 50]
    );
  });

  it('should handle empty message array', async () => {
    await database.initializeDatabase();
    
    await database.saveMessages([]);
    
    // Should not execute any transaction for empty array
    expect(mockDb.execute).not.toHaveBeenCalledWith('BEGIN TRANSACTION');
  });
});