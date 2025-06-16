/**
 * Claude conversation parser with enhanced security validation
 * Transforms Claude export JSON into unified data model
 * Implements strict input sanitization per security constraints
 */

import type { 
  ClaudeExport, 
  ClaudeMessage, 
  Conversation, 
  ChatMessage, 
  ImportResult 
} from '../types';
import { CryptoService } from '../crypto';

export class ClaudeParser {
  private crypto: CryptoService;

  constructor() {
    this.crypto = CryptoService.getInstance();
  }

  /**
   * Parse Claude export JSON file with enhanced validation
   */
  public async parseClaude(fileContent: string): Promise<ImportResult> {
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
      
      // Handle both single conversation and array of conversations
      const conversations = Array.isArray(data) ? data : [data];

      // Validate array size to prevent DoS
      if (conversations.length > 10000) {
        throw new Error('Too many conversations (>10,000)');
      }

      for (const conversationData of conversations) {
        try {
          const parsed = this.parseConversation(conversationData);
          result.conversations.push(parsed.conversation);
          result.messages.push(...parsed.messages);
        } catch (error) {
          result.errors.push(`Failed to parse conversation: ${error}`);
        }
      }

    } catch (error) {
      result.errors.push(`Invalid JSON format: ${error}`);
    }

    return result;
  }

  /**
   * Parse a single Claude conversation with strict validation
   */
  private parseConversation(data: ClaudeExport): { conversation: Conversation; messages: ChatMessage[] } {
    // Enhanced input validation
    this.validateConversationStructure(data);

    // Extract and validate messages
    const messages = this.extractMessages(data.chat_messages, data.uuid);
    
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

    // Use created_at as fallback for conversation timing
    const createdAtTimestamp = this.parseISOTimestamp(data.created_at);
    const updatedAtTimestamp = this.parseISOTimestamp(data.updated_at);

    const conversation: Conversation = {
      id: this.sanitizeString(data.uuid, 255),
      source_app: 'Claude',
      chat_type: 'llm',
      display_name: this.sanitizeString(data.name || data.summary || 'Untitled Claude Chat', 500),
      start_time: Math.min(startTime, createdAtTimestamp),
      end_time: Math.max(endTime, updatedAtTimestamp),
      tags: []
    };

    return { conversation, messages };
  }

  /**
   * Enhanced conversation structure validation for Claude format
   */
  private validateConversationStructure(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid conversation object');
    }

    if (!data.uuid || typeof data.uuid !== 'string') {
      throw new Error('Missing or invalid uuid');
    }

    if (data.uuid.length > 255) {
      throw new Error('uuid too long');
    }

    // Name is optional but if present must be valid
    if (data.name && (typeof data.name !== 'string' || data.name.length > 1000)) {
      throw new Error('Invalid name field');
    }

    if (!data.created_at || typeof data.created_at !== 'string') {
      throw new Error('Missing or invalid created_at');
    }

    if (!data.updated_at || typeof data.updated_at !== 'string') {
      throw new Error('Missing or invalid updated_at');
    }

    if (!data.chat_messages || !Array.isArray(data.chat_messages)) {
      throw new Error('Missing or invalid chat_messages array');
    }

    // Validate messages array size to prevent DoS
    if (data.chat_messages.length > 100000) {
      throw new Error('Too many messages (>100,000)');
    }
  }

  /**
   * Extract and validate messages from Claude chat_messages array
   */
  private extractMessages(claudeMessages: ClaudeMessage[], conversationId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const claudeMessage of claudeMessages) {
      try {
        // Enhanced message validation
        if (!this.isValidClaudeMessage(claudeMessage)) {
          continue;
        }

        // Parse timestamp
        const timestamp = this.parseISOTimestamp(claudeMessage.created_at);

        // Map sender to author
        const author = this.mapClaudeSender(claudeMessage.sender);
        
        // Sanitize content
        let content = this.sanitizeContent(claudeMessage.text || '');
        
        // Handle attachments if present
        if (claudeMessage.attachments && claudeMessage.attachments.length > 0) {
          content = this.processAttachments(content, claudeMessage.attachments);
        }
        
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
        console.warn(`Failed to parse Claude message:`, error);
        continue;
      }
    }

    // Sort messages by index first, then by timestamp
    return messages.sort((a, b) => {
      const aIndex = claudeMessages.find(m => 
        this.crypto.generateHash(this.sanitizeContent(m.text || ''), this.parseISOTimestamp(m.created_at)) === a.message_id
      )?.index || 0;
      const bIndex = claudeMessages.find(m => 
        this.crypto.generateHash(this.sanitizeContent(m.text || ''), this.parseISOTimestamp(m.created_at)) === b.message_id
      )?.index || 0;
      
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return a.timestamp_utc - b.timestamp_utc;
    });
  }

  /**
   * Enhanced Claude message validation
   */
  private isValidClaudeMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;
    if (!message.uuid || typeof message.uuid !== 'string') return false;
    if (!message.text || typeof message.text !== 'string') return false;
    if (!message.sender || typeof message.sender !== 'string') return false;
    if (!['human', 'assistant'].includes(message.sender)) return false;
    if (!message.created_at || typeof message.created_at !== 'string') return false;
    if (typeof message.index !== 'number' || message.index < 0) return false;
    
    return true;
  }

  /**
   * Parse ISO 8601 timestamp to Unix epoch
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
   * Map Claude sender to display name
   */
  private mapClaudeSender(sender: string): string {
    switch (sender.toLowerCase()) {
      case 'human':
        return 'User';
      case 'assistant':
        return 'Claude';
      default:
        return this.sanitizeString(sender, 50);
    }
  }

  /**
   * Process attachments and append to content
   */
  private processAttachments(content: string, attachments: any[]): string {
    let processedContent = content;
    
    for (const attachment of attachments) {
      if (attachment && typeof attachment === 'object') {
        const fileName = this.sanitizeString(attachment.file_name || 'unknown', 255);
        const fileType = this.sanitizeString(attachment.file_type || 'unknown', 100);
        
        processedContent += `\n\n[Attachment: ${fileName} (${fileType})]`;
        
        // Include extracted content if available and safe
        if (attachment.extracted_content && typeof attachment.extracted_content === 'string') {
          const extractedContent = this.sanitizeContent(attachment.extracted_content);
          if (extractedContent.length > 0 && extractedContent.length < 10000) { // Limit extracted content
            processedContent += `\nExtracted content:\n${extractedContent}`;
          }
        }
      }
    }
    
    return processedContent;
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
    ];

    for (const pattern of codePatterns) {
      if (pattern.test(content)) {
        return 'code';
      }
    }

    return 'text';
  }

  /**
   * Enhanced Claude file format validation
   */
  public validateClaudeFile(content: string): { isValid: boolean; error?: string } {
    try {
      // Size validation
      if (content.length > 100 * 1024 * 1024) {
        return { isValid: false, error: 'File too large (>100MB)' };
      }

      if (content.length === 0) {
        return { isValid: false, error: 'Empty file' };
      }

      const data = JSON.parse(content);
      
      // Handle both single conversation and array
      const conversations = Array.isArray(data) ? data : [data];
      
      if (conversations.length === 0) {
        return { isValid: false, error: 'No conversations found' };
      }

      if (conversations.length > 10000) {
        return { isValid: false, error: 'Too many conversations (>10,000)' };
      }

      // Validate each conversation structure
      for (let i = 0; i < Math.min(conversations.length, 10); i++) { // Sample first 10
        const conv = conversations[i];
        
        try {
          this.validateConversationStructure(conv);
        } catch (error) {
          return { isValid: false, error: `Conversation ${i}: ${error}` };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Invalid JSON: ${error}` };
    }
  }
}