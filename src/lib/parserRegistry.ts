/**
 * Parser registry for modular parser selection and management
 * Implements centralized parser discovery and fallback logic
 */

import type { 
  ParserInterface, 
  SupportedFileType, 
  FileValidationResult,
  ImportError
} from './types';
import { ChatGPTParser } from './parsers/chatgpt';
import { ClaudeParser } from './parsers/claude';
import { GeminiParser } from './parsers/gemini';
import { QwenParser } from './parsers/qwen';
import { ImportValidationService } from './importValidation';

export class ParserRegistry {
  private static instance: ParserRegistry;
  private parsers: Map<SupportedFileType, ParserInterface>;
  private parserOrder: SupportedFileType[];
  private validation: ImportValidationService;

  private constructor() {
    this.validation = ImportValidationService.getInstance();
    this.parsers = new Map();
    this.parserOrder = ['chatgpt', 'claude', 'gemini', 'qwen']; // Priority order
    this.initializeParsers();
  }

  public static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  /**
   * Initialize all available parsers
   */
  private initializeParsers(): void {
    // Wrap existing parsers to implement ParserInterface
    this.parsers.set('chatgpt', new ChatGPTParserAdapter());
    this.parsers.set('claude', new ClaudeParserAdapter());
    this.parsers.set('gemini', new GeminiParserAdapter());
    this.parsers.set('qwen', new QwenParserAdapter());
  }

  /**
   * Detect file format with confidence scoring and fallback logic
   */
  public detectFileFormat(content: string, filePath?: string): FileValidationResult {
    const results: Array<FileValidationResult & { parser: SupportedFileType }> = [];

    // Try each parser in priority order
    for (const parserType of this.parserOrder) {
      const parser = this.parsers.get(parserType);
      if (!parser) continue;

      try {
        const result = parser.validateFile(content);
        if (result.isValid) {
          result.confidence = parser.getFormatConfidence(content);
          return {
            ...result,
            fileType: parserType,
            fallbackAttempted: false
          };
        }

        // Store result for potential fallback
        results.push({
          ...result,
          parser: parserType,
          confidence: parser.getFormatConfidence(content)
        });
      } catch (error) {
        console.warn(`Parser ${parserType} failed validation:`, error);
      }
    }

    // If no parser succeeded, try fallback detection
    if (this.validation.getConfig().enableFallbackDetection) {
      const fallbackResult = this.attemptFallbackDetection(content, results);
      if (fallbackResult.isValid) {
        return {
          ...fallbackResult,
          fallbackAttempted: true
        };
      }
    }

    // No parser could handle the file
    return {
      isValid: false,
      error: 'No compatible parser found for file format',
      fileType: 'unknown',
      confidence: 0,
      fallbackAttempted: true
    };
  }

  /**
   * Attempt fallback detection using confidence scores
   */
  private attemptFallbackDetection(
    content: string, 
    results: Array<FileValidationResult & { parser: SupportedFileType }>
  ): FileValidationResult {
    // Find parser with highest confidence, even if validation failed
    const bestMatch = results.reduce((best, current) => {
      return current.confidence > best.confidence ? current : best;
    }, { confidence: 0, parser: 'unknown' as SupportedFileType });

    if (bestMatch.confidence > 30) { // Minimum confidence threshold
      return {
        isValid: true,
        warning: `Format detection uncertain, using ${bestMatch.parser} parser (confidence: ${bestMatch.confidence}%)`,
        fileType: bestMatch.parser,
        confidence: bestMatch.confidence
      };
    }

    return {
      isValid: false,
      error: 'Unable to determine file format with sufficient confidence',
      fileType: 'unknown',
      confidence: bestMatch.confidence
    };
  }

  /**
   * Get parser for specific file type
   */
  public getParser(fileType: SupportedFileType): ParserInterface | null {
    return this.parsers.get(fileType) || null;
  }

  /**
   * Get all available parsers
   */
  public getAvailableParsers(): SupportedFileType[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Register a new parser
   */
  public registerParser(fileType: SupportedFileType, parser: ParserInterface): void {
    this.parsers.set(fileType, parser);
    if (!this.parserOrder.includes(fileType)) {
      this.parserOrder.push(fileType);
    }
  }

  /**
   * Update parser priority order
   */
  public setParserOrder(order: SupportedFileType[]): void {
    this.parserOrder = order.filter(type => this.parsers.has(type));
  }
}

// Adapter classes to wrap existing parsers with ParserInterface

class ChatGPTParserAdapter implements ParserInterface {
  readonly name = 'ChatGPT Parser';
  readonly supportedTypes: SupportedFileType[] = ['chatgpt'];
  private parser = new ChatGPTParser();

  validateFile(content: string): FileValidationResult {
    const result = this.parser.validateChatGPTFile(content);
    return {
      isValid: result.isValid,
      error: result.error,
      fileType: result.isValid ? 'chatgpt' : undefined,
      confidence: result.isValid ? 95 : 0
    };
  }

  async parseContent(content: string) {
    return await this.parser.parseChatGPT(content);
  }

  getFormatConfidence(content: string): number {
    try {
      const data = JSON.parse(content);
      let score = 0;

      // Check for ChatGPT-specific fields
      if (data.conversation_id) score += 30;
      if (data.mapping) score += 30;
      if (data.title) score += 10;
      
      // Check mapping structure
      if (data.mapping && typeof data.mapping === 'object') {
        const keys = Object.keys(data.mapping);
        if (keys.length > 0) {
          const firstNode = data.mapping[keys[0]];
          if (firstNode?.message?.author?.role) score += 20;
          if (firstNode?.message?.content?.parts) score += 10;
        }
      }

      return Math.min(score, 100);
    } catch {
      return 0;
    }
  }
}

class ClaudeParserAdapter implements ParserInterface {
  readonly name = 'Claude Parser';
  readonly supportedTypes: SupportedFileType[] = ['claude'];
  private parser = new ClaudeParser();

  validateFile(content: string): FileValidationResult {
    const result = this.parser.validateClaudeFile(content);
    return {
      isValid: result.isValid,
      error: result.error,
      fileType: result.isValid ? 'claude' : undefined,
      confidence: result.isValid ? 95 : 0
    };
  }

  async parseContent(content: string) {
    return await this.parser.parseClaude(content);
  }

  getFormatConfidence(content: string): number {
    try {
      const data = JSON.parse(content);
      let score = 0;

      // Check for Claude-specific fields
      if (data.uuid) score += 25;
      if (data.chat_messages) score += 30;
      if (data.created_at && data.updated_at) score += 15;
      
      // Check chat_messages structure
      if (Array.isArray(data.chat_messages) && data.chat_messages.length > 0) {
        const firstMsg = data.chat_messages[0];
        if (firstMsg.sender && ['human', 'assistant'].includes(firstMsg.sender)) score += 20;
        if (typeof firstMsg.index === 'number') score += 10;
      }

      return Math.min(score, 100);
    } catch {
      return 0;
    }
  }
}

class GeminiParserAdapter implements ParserInterface {
  readonly name = 'Gemini Parser';
  readonly supportedTypes: SupportedFileType[] = ['gemini'];
  private parser = new GeminiParser();

  validateFile(content: string): FileValidationResult {
    const result = this.parser.validateGeminiFile(content);
    return {
      isValid: result.isValid,
      error: result.error,
      fileType: result.isValid ? 'gemini' : undefined,
      confidence: result.isValid ? 95 : 0
    };
  }

  async parseContent(content: string) {
    return await this.parser.parseGemini(content);
  }

  getFormatConfidence(content: string): number {
    try {
      const data = JSON.parse(content);
      let score = 0;

      // Check for Gemini standard format
      if (data.conversations && Array.isArray(data.conversations)) {
        score += 40;
        if (data.conversations[0]?.conversation_id) score += 20;
        if (data.conversations[0]?.messages) score += 20;
      }

      // Check for Gemini Takeout format
      if (data.id && data.messages && Array.isArray(data.messages)) {
        score += 30;
        if (data.messages[0]?.creator) score += 20;
        if (data.created_date) score += 10;
      }

      // Check for array of Takeout conversations
      if (Array.isArray(data) && data[0]?.messages?.[0]?.creator) {
        score += 40;
      }

      return Math.min(score, 100);
    } catch {
      return 0;
    }
  }
}

class QwenParserAdapter implements ParserInterface {
  readonly name = 'Qwen Parser';
  readonly supportedTypes: SupportedFileType[] = ['qwen'];
  private parser = new QwenParser();

  validateFile(content: string): FileValidationResult {
    const result = this.parser.validateQwenFile(content);
    return {
      isValid: result.isValid,
      error: result.error,
      fileType: result.isValid ? 'qwen' : undefined,
      confidence: result.isValid ? 95 : 0
    };
  }

  async parseContent(content: string) {
    return await this.parser.parseQwen(content);
  }

  getFormatConfidence(content: string): number {
    try {
      // Try JSON format first
      const data = JSON.parse(content);
      let score = 0;

      // Check for Qwen-specific fields
      if (data.conversation_id || data.session_id) score += 25;
      if (data.messages || data.chat_history || data.dialogue) score += 30;
      
      // Check message structure
      const messages = data.messages || data.chat_history || data.dialogue;
      if (Array.isArray(messages) && messages.length > 0) {
        const firstMsg = messages[0];
        if (firstMsg.role || firstMsg.sender) score += 20;
        if (firstMsg.content || firstMsg.text || firstMsg.message) score += 15;
      }

      // Bonus for Chinese content
      const contentStr = JSON.stringify(data);
      if (/[\u4e00-\u9fff]/.test(contentStr)) score += 10;

      return Math.min(score, 100);
    } catch {
      // Try text log format
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) return 0;

      let score = 0;
      const qwenLogPatterns = [
        /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*?(user|assistant|human|qwen|ai).*?:/i,
        /^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\].*?(user|assistant|human|qwen|ai).*?:/i,
        /^(user|assistant|human|qwen|ai)\s*\(\d{4}-\d{2}-\d{2}.*?\):/i,
        /^(user|assistant|human|qwen|ai):\s*\d{4}-\d{2}-\d{2}/i,
      ];

      const matchingLines = lines.slice(0, 10).filter(line => 
        qwenLogPatterns.some(pattern => pattern.test(line))
      );

      if (matchingLines.length > 0) {
        score = Math.min((matchingLines.length / Math.min(lines.length, 10)) * 80, 80);
        
        // Bonus for Chinese content
        if (/[\u4e00-\u9fff]/.test(content)) score += 15;
      }

      return score;
    }
  }
}