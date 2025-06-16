/**
 * Gemini (Google AI) conversation parser with enhanced security validation
 * Transforms Gemini export JSON into unified data model
 * Implements strict input sanitization per security constraints
 */

import type { 
  GeminiExport,
  GeminiConversation,
  GeminiMessage,
  GeminiTakeoutExport,
  GeminiTakeoutMessage,
  Conversation, 
  ChatMessage, 
  ImportResult 
} from '../types';
import { CryptoService } from '../crypto';

export class GeminiParser {
  private crypto: CryptoService;

  constructor() {
    this.crypto = CryptoService.getInstance();
  }

  /**
   * Parse Gemini export JSON file with enhanced validation
   */
  public async parseGemini(fileContent: string): Promise<ImportResult> {
    const result: ImportResult = {
      conversations: [],
      messages: [],
      errors: []
    };

    try {
      // Strict JSON parsing with size limits
      if (fileContent.length > 100 * 1024 * 1024) { // 100MB limit
        throw new Error('File too large (>100MB)');
      }

      const data = JSON.parse(fileContent);
      
      // Detect format type and parse accordingly
      if (this.isGeminiStandardFormat(data)) {
        await this.parseStandardFormat(data, result);
      } else if (this.isGeminiTakeoutFormat(data)) {
        await this.parseTakeoutFormat(data, result);
      } else {
        throw new Error('Unrecognized Gemini format');
      }

    } catch (error) {
      result.errors.push(`Invalid JSON format: ${error}`);
    }

    return result;
  }

  /**
   * Parse standard Gemini format with conversations array
   */
  private async parseStandardFormat(data: GeminiExport, result: ImportResult): Promise<void> {
    if (!Array.isArray(data.conversations)) {
      throw new Error('Invalid conversations array');
    }

    // Validate array size to prevent DoS
    if (data.conversations.length > 10000) {
      throw new Error('Too many conversations (>10,000)');
    }

    for (const conversationData of data.conversations) {
      try {
        const parsed = this.parseStandardConversation(conversationData);
        result.conversations.push(parsed.conversation);
        result.messages.push(...parsed.messages);
      } catch (error) {
        result.errors.push(`Failed to parse conversation: ${error}`);
      }
    }
  }

  /**
   * Parse Google Takeout format (single conversation or array)
   */
  private async parseTakeoutFormat(data: GeminiTakeoutExport | GeminiTakeoutExport[], result: ImportResult): Promise<void> {
    const conversations = Array.isArray(data) ? data : [data];

    // Validate array size to prevent DoS
    if (conversations.length > 10000) {
      throw new Error('Too many conversations (>10,000)');
    }

    for (const conversationData of conversations) {
      try {
        const parsed = this.parseTakeoutConversation(conversationData);
        result.conversations.push(parsed.conversation);
        result.messages.push(...parsed.messages);
      } catch (error) {
        result.errors.push(`Failed to parse conversation: ${error}`);
      }
    }
  }

  /**
   * Parse a single standard Gemini conversation
   */
  private parseStandardConversation(data: GeminiConversation): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateStandardConversationStructure(data);

    // Extract and validate messages
    const messages = this.extractStandardMessages(data.messages, data.conversation_id);
    
    if (messages.length === 0) {
      throw new Error('No valid messages found in conversation');
    }

    // Validate message count to prevent resource exhaustion
    if (messages.length > 50000) {
      throw new Error('Conversation too large (>50,000 messages)');
    }

    // Calculate conversation time bounds
    const timestamps = messages.map(m => m.timestamp_utc);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    // Validate timestamp sanity
    if (startTime < 0 || endTime < startTime) {
      throw new Error('Invalid timestamp range detected');
    }

    // Use conversation-level timestamps as fallback
    const createTimestamp = this.parseISOTimestamp(data.create_time);
    const updateTimestamp = this.parseISOTimestamp(data.update_time);

    const conversation: Conversation = {
      id: this.sanitizeString(data.conversation_id, 255),
      source_app: 'Google Gemini',
      chat_type: 'llm',
      display_name: this.sanitizeString(data.conversation_title || 'Untitled Gemini Chat', 500),
      start_time: Math.min(startTime, createTimestamp),
      end_time: Math.max(endTime, updateTimestamp),
      tags: []
    };

    return { conversation, messages };
  }

  /**
   * Parse a single Takeout format conversation
   */
  private parseTakeoutConversation(data: GeminiTakeoutExport): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateTakeoutConversationStructure(data);

    // Extract and validate messages
    const messages = this.extractTakeoutMessages(data.messages, data.id);
    
    if (messages.length === 0) {
      throw new Error('No valid messages found in conversation');
    }

    // Validate message count to prevent resource exhaustion
    if (messages.length > 50000) {
      throw new Error('Conversation too large (>50,000 messages)');
    }

    // Calculate conversation time bounds
    const timestamps = messages.map(m => m.timestamp_utc);
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    // Validate timestamp sanity
    if (startTime < 0 || endTime < startTime) {
      throw new Error('Invalid timestamp range detected');
    }

    // Use conversation-level timestamps as fallback
    const createTimestamp = this.parseISOTimestamp(data.created_date);
    const updateTimestamp = this.parseISOTimestamp(data.updated_date);

    const conversation: Conversation = {
      id: this.sanitizeString(data.id, 255),
      source_app: 'Google Gemini',
      chat_type: 'llm',
      display_name: this.sanitizeString(data.name || 'Untitled Gemini Chat', 500),
      start_time: Math.min(startTime, createTimestamp),
      end_time: Math.max(endTime, updateTimestamp),
      tags: []
    };

    return { conversation, messages };
  }

  /**
   * Extract messages from standard Gemini format
   */
  private extractStandardMessages(geminiMessages: GeminiMessage[], conversationId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const geminiMessage of geminiMessages) {
      try {
        // Enhanced message validation
        if (!this.isValidStandardMessage(geminiMessage)) {
          continue;
        }

        // Parse timestamp
        const timestamp = this.parseISOTimestamp(geminiMessage.create_time);

        // Map author to unified format
        const author = this.mapGeminiAuthor(geminiMessage.author.name);
        
        // Sanitize content
        const content = this.sanitizeContent(geminiMessage.text || '');
        
        // Skip empty messages after sanitization
        if (!content.trim()) continue;

        // Determine content type
        const contentType = this.determineContentType(content);

        // Generate secure message ID
        const messageId = this.crypto.generateHash(content, timestamp);

        messages.push({
          message_id: messageId,
          conversation_id: conversationId,
          timestamp_utc: timestamp,
          author: this.sanitizeString(author, 100),
          content: content,
          content_type: contentType
        });

      } catch (error) {
        // Log individual message parsing errors but continue processing
        console.warn(`Failed to parse Gemini message:`, error);
        continue;
      }
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Extract messages from Takeout format
   */
  private extractTakeoutMessages(geminiMessages: GeminiTakeoutMessage[], conversationId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const geminiMessage of geminiMessages) {
      try {
        // Enhanced message validation
        if (!this.isValidTakeoutMessage(geminiMessage)) {
          continue;
        }

        // Parse timestamp
        const timestamp = this.parseISOTimestamp(geminiMessage.created_date);

        // Map author to unified format
        const author = this.mapGeminiAuthor(geminiMessage.creator.name);
        
        // Sanitize content
        const content = this.sanitizeContent(geminiMessage.content || '');
        
        // Skip empty messages after sanitization
        if (!content.trim()) continue;

        // Determine content type
        const contentType = this.determineContentType(content);

        // Generate secure message ID
        const messageId = this.crypto.generateHash(content, timestamp);

        messages.push({
          message_id: messageId,
          conversation_id: conversationId,
          timestamp_utc: timestamp,
          author: this.sanitizeString(author, 100),
          content: content,
          content_type: contentType
        });

      } catch (error) {
        // Log individual message parsing errors but continue processing
        console.warn(`Failed to parse Gemini message:`, error);
        continue;
      }
    }

    // Sort messages chronologically
    return messages.sort((a, b) => a.timestamp_utc - b.timestamp_utc);
  }

  /**
   * Detect if data is standard Gemini format
   */
  private isGeminiStandardFormat(data: any): data is GeminiExport {
    return data && 
           typeof data === 'object' && 
           Array.isArray(data.conversations) &&
           data.conversations.length > 0 &&
           data.conversations[0].conversation_id !== undefined;
  }

  /**
   * Detect if data is Gemini Takeout format
   */
  private isGeminiTakeoutFormat(data: any): data is GeminiTakeoutExport | GeminiTakeoutExport[] {
    const items = Array.isArray(data) ? data : [data];
    return items.length > 0 &&
           items[0] &&
           typeof items[0] === 'object' &&
           (items[0].id !== undefined || items[0].name !== undefined) &&
           Array.isArray(items[0].messages) &&
           items[0].messages.length > 0 &&
           items[0].messages[0].creator !== undefined;
  }

  /**
   * Enhanced standard conversation structure validation
   */
  private validateStandardConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    if (!data.conversation_id || typeof data.conversation_id !== 'string') {
      throw new Error('Missing or invalid conversation_id');
    }

    if (data.conversation_id.length > 255) {
      throw new Error('conversation_id too long');
    }

    if (!data.create_time || typeof data.create_time !== 'string') {
      throw new Error('Missing or invalid create_time');
    }

    if (!data.update_time || typeof data.update_time !== 'string') {
      throw new Error('Missing or invalid update_time');
    }

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Missing or invalid messages array');
    }

    // Validate messages array size to prevent DoS
    if (data.messages.length > 100000) {
      throw new Error('Too many messages (>100,000)');
    }
  }

  /**
   * Enhanced Takeout conversation structure validation
   */
  private validateTakeoutConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    if (!data.id || typeof data.id !== 'string') {
      throw new Error('Missing or invalid id');
    }

    if (data.id.length > 255) {
      throw new Error('id too long');
    }

    if (!data.created_date || typeof data.created_date !== 'string') {
      throw new Error('Missing or invalid created_date');
    }

    if (!data.updated_date || typeof data.updated_date !== 'string') {
      throw new Error('Missing or invalid updated_date');
    }

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Missing or invalid messages array');
    }

    // Validate messages array size to prevent DoS
    if (data.messages.length > 100000) {
      throw new Error('Too many messages (>100,000)');
    }
  }

  /**
   * Enhanced standard message validation
   */
  private isValidStandardMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;
    if (!message.create_time || typeof message.create_time !== 'string') return false;
    if (!message.text || typeof message.text !== 'string') return false;
    if (!message.author || typeof message.author !== 'object') return false;
    if (!message.author.name || typeof message.author.name !== 'string') return false;
    
    return true;
  }

  /**
   * Enhanced Takeout message validation
   */
  private isValidTakeoutMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;
    if (!message.created_date || typeof message.created_date !== 'string') return false;
    if (!message.content || typeof message.content !== 'string') return false;
    if (!message.creator || typeof message.creator !== 'object') return false;
    if (!message.creator.name || typeof message.creator.name !== 'string') return false;
    
    return true;
  }

  /**
   * Parse ISO 8601 timestamp to Unix epoch with enhanced validation
   */
  private parseISOTimestamp(isoString: string): number {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }
      
      const timestamp = Math.floor(date.getTime() / 1000);
      
      // Validate timestamp is reasonable (not negative, not too far in future)
      if (timestamp < 0 || timestamp > Date.now() / 1000 + 86400) {
        throw new Error('Timestamp out of valid range');
      }
      
      return timestamp;
    } catch (error) {
      throw new Error(`Failed to parse timestamp "${isoString}": ${error}`);
    }
  }

  /**
   * Map Gemini author names to unified format with role normalization
   */
  private mapGeminiAuthor(authorName: string): string {
    if (typeof authorName !== 'string') return 'Unknown';
    
    const normalizedName = authorName.toLowerCase().trim();
    
    // Common Gemini role patterns
    if (normalizedName.includes('gemini') || 
        normalizedName.includes('bard') || 
        normalizedName === 'model' ||
        normalizedName === 'assistant' ||
        normalizedName === 'ai') {
      return 'Gemini';
    }
    
    if (normalizedName === 'user' || 
        normalizedName === 'human' ||
        normalizedName.includes('you')) {
      return 'User';
    }
    
    // Return sanitized original name for other cases
    return this.sanitizeString(authorName, 50);
  }

  /**
   * Sanitize string input with length limits and dangerous character removal
   */
  private sanitizeString(input: string, maxLength: number): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Remove null bytes and control characters except newlines/tabs
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim and limit length
    sanitized = sanitized.trim().substring(0, maxLength);
    
    return sanitized;
  }

  /**
   * Sanitize content with enhanced security checks
   */
  private sanitizeContent(content: string): string {
    if (typeof content !== 'string') return '';
    
    // Content size limit (1MB per message)
    if (content.length > 1024 * 1024) {
      content = content.substring(0, 1024 * 1024);
    }

    // Remove dangerous control characters but preserve formatting
    return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Determine content type with enhanced pattern matching
   */
  private determineContentType(content: string): 'text' | 'code' {
    // Enhanced code detection patterns
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`\n]+`/g, // Inline code
      /^\s*(?:function|class|def|import|from|const|let|var|if|for|while|return)\s/m, // Code keywords
      /^\s*[{}\[\]();]/m, // Code punctuation at line start
      /^\s*(?:\/\/|\/\*|\#|<!--)/m, // Comment patterns
      /(?:npm|pip|cargo|go get)\s+install/i, // Package manager commands
      /^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im, // SQL keywords
      /^\s*(?:print|console\.log|echo|printf)\s*\(/m, // Print statements
    ];

    for (const pattern of codePatterns) {
      if (pattern.test(content)) {
        return 'code';
      }
    }

    return 'text';
  }

  /**
   * Enhanced Gemini file format validation
   */
  public validateGeminiFile(content: string): { isValid: boolean; error?: string } {
    try {
      // Size validation
      if (content.length > 100 * 1024 * 1024) {
        return { isValid: false, error: 'File too large (>100MB)' };
      }

      if (content.length === 0) {
        return { isValid: false, error: 'Empty file' };
      }

      const data = JSON.parse(content);
      
      // Check if it's either format
      if (!this.isGeminiStandardFormat(data) && !this.isGeminiTakeoutFormat(data)) {
        return { isValid: false, error: 'Not a valid Gemini format' };
      }

      // Validate structure based on detected format
      if (this.isGeminiStandardFormat(data)) {
        if (data.conversations.length > 10000) {
          return { isValid: false, error: 'Too many conversations (>10,000)' };
        }

        // Validate sample conversations
        for (let i = 0; i < Math.min(data.conversations.length, 10); i++) {
          try {
            this.validateStandardConversationStructure(data.conversations[i]);
          } catch (error) {
            return { isValid: false, error: `Conversation ${i}: ${error}` };
          }
        }
      } else {
        const conversations = Array.isArray(data) ? data : [data];
        
        if (conversations.length > 10000) {
          return { isValid: false, error: 'Too many conversations (>10,000)' };
        }

        // Validate sample conversations
        for (let i = 0; i < Math.min(conversations.length, 10); i++) {
          try {
            this.validateTakeoutConversationStructure(conversations[i]);
          } catch (error) {
            return { isValid: false, error: `Conversation ${i}: ${error}` };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Invalid JSON: ${error}` };
    }
  }
}