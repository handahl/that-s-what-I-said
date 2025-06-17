/**
 * Fixed database service for encrypted local storage
 * Handles all SQLite operations with encryption and proper error handling
 */

import Database from '@tauri-apps/plugin-sql';
import type { ChatMessage, Conversation } from './types';
import { CryptoService } from './crypto';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: Database | null = null;
  private crypto: CryptoService;
  private isInitialized = false;

  private constructor() {
    this.crypto = CryptoService.getInstance();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database connection and create tables
   */
  public async initializeDatabase(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure crypto is initialized before database operations
      if (!this.crypto.isInitialized()) {
        throw new Error('Encryption must be initialized before database');
      }

      this.db = await Database.load('sqlite:thats_what_i_said.db');
      
      // Create conversations table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          source_app TEXT NOT NULL,
          chat_type TEXT NOT NULL CHECK (chat_type IN ('llm', 'human')),
          display_name TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create messages table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          message_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          timestamp_utc INTEGER NOT NULL,
          author TEXT NOT NULL,
          content TEXT NOT NULL,
          content_type TEXT NOT NULL CHECK (content_type IN ('text', 'code')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations (id)
        )
      `);

      // Create indexes for performance
      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
        ON messages (conversation_id)
      `);
      
      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
        ON messages (timestamp_utc)
      `);

      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_conversations_start_time 
        ON conversations (start_time)
      `);

      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_conversations_end_time 
        ON conversations (end_time)
      `);

      // Create metadata table for app settings
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.isInitialized = true;
      console.log('Database initialized successfully');

    } catch (error) {
      console.error('Database initialization failed:', error);
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  /**
   * Check if database is properly initialized
   */
  public isReady(): boolean {
    return this.isInitialized && this.db !== null && this.crypto.isInitialized();
  }

  /**
   * Store encryption salt for persistence
   */
  public async storeSalt(salt: string): Promise<void> {
    if (!this.isReady()) throw new Error('Database not ready');

    await this.db!.execute(`
      INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
      VALUES ('encryption_salt', ?, CURRENT_TIMESTAMP)
    `, [salt]);
  }

  /**
   * Retrieve stored encryption salt
   */
  public async getSalt(): Promise<string | null> {
    if (!this.db) return null;

    try {
      const result = await this.db.select(`
        SELECT value FROM app_metadata WHERE key = 'encryption_salt'
      `);

      return result.length > 0 ? result[0].value as string : null;
    } catch (error) {
      console.warn('Failed to retrieve salt:', error);
      return null;
    }
  }

  /**
   * Save or update a conversation
   */
  public async saveConversation(conversation: Conversation): Promise<void> {
    if (!this.isReady()) throw new Error('Database not ready');

    try {
      const encryptedDisplayName = this.crypto.encrypt(conversation.display_name);
      const encryptedTags = this.crypto.encrypt(JSON.stringify(conversation.tags));

      await this.db!.execute(`
        INSERT OR REPLACE INTO conversations 
        (id, source_app, chat_type, display_name, start_time, end_time, tags, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        conversation.id,
        conversation.source_app,
        conversation.chat_type,
        encryptedDisplayName,
        conversation.start_time,
        conversation.end_time,
        encryptedTags
      ]);
    } catch (error) {
      throw new Error(`Failed to save conversation: ${error}`);
    }
  }

  /**
   * Save multiple messages in a single transaction
   */
  public async saveMessages(messages: ChatMessage[]): Promise<void> {
    if (!this.isReady()) throw new Error('Database not ready');
    if (messages.length === 0) return;

    // Begin transaction
    await this.db!.execute('BEGIN TRANSACTION');

    try {
      for (const message of messages) {
        const encryptedContent = this.crypto.encrypt(message.content);
        const encryptedAuthor = this.crypto.encrypt(message.author);

        await this.db!.execute(`
          INSERT OR REPLACE INTO messages 
          (message_id, conversation_id, timestamp_utc, author, content, content_type)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          message.message_id,
          message.conversation_id,
          message.timestamp_utc,
          encryptedAuthor,
          encryptedContent,
          message.content_type
        ]);
      }

      await this.db!.execute('COMMIT');
    } catch (error) {
      await this.db!.execute('ROLLBACK');
      throw new Error(`Failed to save messages: ${error}`);
    }
  }

  /**
   * Get paginated list of conversations
   */
  public async getConversations(
    sortBy: 'end_time' | 'start_time' = 'end_time',
    limit: number = 50,
    offset: number = 0
  ): Promise<Conversation[]> {
    if (!this.isReady()) throw new Error('Database not ready');

    const orderBy = sortBy === 'end_time' ? 'end_time DESC' : 'start_time DESC';
    
    try {
      const result = await this.db!.select(`
        SELECT * FROM conversations 
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      return result.map(row => ({
        id: row.id as string,
        source_app: row.source_app as string,
        chat_type: row.chat_type as 'llm' | 'human',
        display_name: this.crypto.decrypt(row.display_name as string),
        start_time: row.start_time as number,
        end_time: row.end_time as number,
        tags: JSON.parse(this.crypto.decrypt(row.tags as string))
      }));
    } catch (error) {
      throw new Error(`Failed to get conversations: ${error}`);
    }
  }

  /**
   * Get all messages for a specific conversation
   */
  public async getMessagesForConversation(conversationId: string): Promise<ChatMessage[]> {
    if (!this.isReady()) throw new Error('Database not ready');

    try {
      const result = await this.db!.select(`
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY timestamp_utc ASC
      `, [conversationId]);

      return result.map(row => ({
        message_id: row.message_id as string,
        conversation_id: row.conversation_id as string,
        timestamp_utc: row.timestamp_utc as number,
        author: this.crypto.decrypt(row.author as string),
        content: this.crypto.decrypt(row.content as string),
        content_type: row.content_type as 'text' | 'code'
      }));
    } catch (error) {
      throw new Error(`Failed to get messages: ${error}`);
    }
  }

  /**
   * Get conversation count
   */
  public async getConversationCount(): Promise<number> {
    if (!this.isReady()) return 0;

    try {
      const result = await this.db!.select('SELECT COUNT(*) as count FROM conversations');
      return result[0].count as number;
    } catch (error) {
      console.warn('Failed to get conversation count:', error);
      return 0;
    }
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}