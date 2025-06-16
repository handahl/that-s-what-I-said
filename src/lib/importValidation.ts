/**
 * Centralized validation service for all file imports
 * Implements security-first validation with comprehensive error reporting
 */

import type { 
  ImportValidationConfig, 
  FileValidationResult, 
  ImportError, 
  SupportedFileType 
} from './types';

export class ImportValidationService {
  private static instance: ImportValidationService;
  private config: ImportValidationConfig;

  private constructor() {
    this.config = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxConversations: 10000,
      maxMessages: 100000,
      maxContentLength: 1024 * 1024, // 1MB per message
      allowedFileTypes: ['chatgpt', 'claude', 'gemini', 'qwen', 'whatsapp'],
      enableFallbackDetection: true
    };
  }

  public static getInstance(): ImportValidationService {
    if (!ImportValidationService.instance) {
      ImportValidationService.instance = new ImportValidationService();
    }
    return ImportValidationService.instance;
  }

  /**
   * Validate file size and basic structure before parsing
   */
  public validateFileSize(content: string, filePath?: string): ImportError | null {
    if (content.length === 0) {
      return this.createError('validation', 'high', 'Empty file provided', filePath);
    }

    if (content.length > this.config.maxFileSize) {
      return this.createError(
        'validation', 
        'high', 
        `File too large: ${content.length} bytes (max: ${this.config.maxFileSize})`,
        filePath
      );
    }

    return null;
  }

  /**
   * Validate file encoding and detect potential issues
   */
  public validateEncoding(content: string, filePath?: string): ImportError | null {
    try {
      // Check for common encoding issues
      if (content.includes('\uFFFD')) {
        return this.createError(
          'validation',
          'medium',
          'File contains invalid UTF-8 sequences (replacement characters detected)',
          filePath
        );
      }

      // Check for suspicious control characters
      const dangerousChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
      const matches = content.match(dangerousChars);
      if (matches && matches.length > 10) { // Allow some, but not excessive
        return this.createError(
          'validation',
          'medium',
          `File contains ${matches.length} potentially dangerous control characters`,
          filePath
        );
      }

      return null;
    } catch (error) {
      return this.createError(
        'validation',
        'high',
        `Encoding validation failed: ${error}`,
        filePath
      );
    }
  }

  /**
   * Validate JSON structure without parsing content
   */
  public validateJSONStructure(content: string, filePath?: string): ImportError | null {
    try {
      const trimmed = content.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null; // Not JSON, skip validation
      }

      JSON.parse(trimmed);
      return null;
    } catch (error) {
      return this.createError(
        'validation',
        'high',
        `Invalid JSON structure: ${error}`,
        filePath
      );
    }
  }

  /**
   * Validate conversation count limits
   */
  public validateConversationCount(count: number, filePath?: string): ImportError | null {
    if (count > this.config.maxConversations) {
      return this.createError(
        'validation',
        'high',
        `Too many conversations: ${count} (max: ${this.config.maxConversations})`,
        filePath
      );
    }
    return null;
  }

  /**
   * Validate message count limits
   */
  public validateMessageCount(count: number, filePath?: string): ImportError | null {
    if (count > this.config.maxMessages) {
      return this.createError(
        'validation',
        'high',
        `Too many messages: ${count} (max: ${this.config.maxMessages})`,
        filePath
      );
    }
    return null;
  }

  /**
   * Validate content length
   */
  public validateContentLength(content: string, filePath?: string): ImportError | null {
    if (content.length > this.config.maxContentLength) {
      return this.createError(
        'validation',
        'medium',
        `Content too long: ${content.length} chars (max: ${this.config.maxContentLength})`,
        filePath
      );
    }
    return null;
  }

  /**
   * Validate file type is supported
   */
  public validateFileType(fileType: SupportedFileType, filePath?: string): ImportError | null {
    if (!this.config.allowedFileTypes.includes(fileType)) {
      return this.createError(
        'validation',
        'high',
        `Unsupported file type: ${fileType}`,
        filePath
      );
    }
    return null;
  }

  /**
   * Sanitize string content with security checks
   */
  public sanitizeContent(content: string, maxLength?: number): string {
    if (typeof content !== 'string') {
      return '';
    }

    // Remove dangerous control characters but preserve formatting
    let sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normalize Unicode for consistent character handling
    try {
      sanitized = sanitized.normalize('NFC');
    } catch (error) {
      // If normalization fails, continue with original
    }

    // Apply length limit if specified
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
      
      // Ensure we don't cut in the middle of a surrogate pair
      if (sanitized.charCodeAt(sanitized.length - 1) >= 0xD800 && 
          sanitized.charCodeAt(sanitized.length - 1) <= 0xDBFF) {
        sanitized = sanitized.substring(0, sanitized.length - 1);
      }
    }

    return sanitized.trim();
  }

  /**
   * Validate timestamp is within reasonable bounds
   */
  public validateTimestamp(timestamp: number, filePath?: string): ImportError | null {
    const now = Date.now() / 1000;
    const oneDay = 24 * 60 * 60;

    if (timestamp < 0) {
      return this.createError(
        'validation',
        'medium',
        `Invalid timestamp: ${timestamp} (negative value)`,
        filePath
      );
    }

    if (timestamp > now + oneDay) {
      return this.createError(
        'validation',
        'medium',
        `Invalid timestamp: ${timestamp} (too far in future)`,
        filePath
      );
    }

    // Check if timestamp is reasonable (after year 2000)
    const year2000 = 946684800; // 2000-01-01 00:00:00 UTC
    if (timestamp < year2000) {
      return this.createError(
        'validation',
        'low',
        `Suspicious timestamp: ${timestamp} (before year 2000)`,
        filePath
      );
    }

    return null;
  }

  /**
   * Create standardized error object
   */
  private createError(
    type: ImportError['type'],
    severity: ImportError['severity'],
    message: string,
    file?: string,
    details?: Record<string, any>
  ): ImportError {
    return {
      type,
      severity,
      message,
      file,
      timestamp: Date.now(),
      details
    };
  }

  /**
   * Update validation configuration
   */
  public updateConfig(newConfig: Partial<ImportValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current validation configuration
   */
  public getConfig(): ImportValidationConfig {
    return { ...this.config };
  }
}