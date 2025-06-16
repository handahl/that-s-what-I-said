/**
 * Enhanced tests for file importer service including Gemini support
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileImporter } from '../lib/fileImporter';
import { CryptoService } from '../lib/crypto';

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn()
}));

vi.mock('@tauri-apps/api/fs', () => ({
  readTextFile: vi.fn()
}));

vi.mock('../lib/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      saveConversation: vi.fn(),
      saveMessages: vi.fn()
    }))
  }
}));

import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/api/fs';

describe('FileImporter', () => {
  let importer: FileImporter;
  let crypto: CryptoService;

  beforeEach(async () => {
    crypto = CryptoService.getInstance();
    await crypto.initializeEncryption('test-password');
    importer = new FileImporter();
    
    vi.clearAllMocks();
  });

  const mockChatGPTContent = JSON.stringify({
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
        children: []
      }
    }
  });

  const mockClaudeContent = JSON.stringify({
    uuid: 'claude-conv-123',
    name: 'Test Claude Conversation',
    created_at: '2024-01-15T10:30:00.000Z',
    updated_at: '2024-01-15T11:45:00.000Z',
    chat_messages: [
      {
        uuid: 'msg-1',
        text: 'Hello Claude!',
        sender: 'human',
        index: 0,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z'
      }
    ]
  });

  const mockGeminiStandardContent = JSON.stringify({
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
            text: 'Hello Gemini!'
          }
        ]
      }
    ]
  });

  const mockGeminiTakeoutContent = JSON.stringify({
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
        content: 'Hello Gemini!'
      }
    ]
  });

  describe('File Selection', () => {
    it('should select files using dialog', async () => {
      const mockFiles = ['/path/to/file1.json', '/path/to/file2.json'];
      (open as any).mockResolvedValue(mockFiles);

      const result = await importer.selectFiles();
      
      expect(result).toEqual(mockFiles);
      expect(open).toHaveBeenCalledWith({
        multiple: true,
        filters: [
          {
            name: 'Chat Files',
            extensions: ['json', 'txt', 'md']
          }
        ]
      });
    });

    it('should handle single file selection', async () => {
      (open as any).mockResolvedValue('/path/to/single-file.json');

      const result = await importer.selectFiles();
      
      expect(result).toEqual(['/path/to/single-file.json']);
    });

    it('should handle cancelled file selection', async () => {
      (open as any).mockResolvedValue(null);

      const result = await importer.selectFiles();
      
      expect(result).toEqual([]);
    });
  });

  describe('File Validation', () => {
    it('should validate ChatGPT file correctly', async () => {
      (readTextFile as any).mockResolvedValue(mockChatGPTContent);

      const result = await importer.validateFile('/path/to/chatgpt.json');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('chatgpt');
    });

    it('should validate Claude file correctly', async () => {
      (readTextFile as any).mockResolvedValue(mockClaudeContent);

      const result = await importer.validateFile('/path/to/claude.json');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('claude');
    });

    it('should validate Gemini standard format correctly', async () => {
      (readTextFile as any).mockResolvedValue(mockGeminiStandardContent);

      const result = await importer.validateFile('/path/to/gemini-standard.json');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('gemini');
    });

    it('should validate Gemini Takeout format correctly', async () => {
      (readTextFile as any).mockResolvedValue(mockGeminiTakeoutContent);

      const result = await importer.validateFile('/path/to/gemini-takeout.json');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('gemini');
    });

    it('should detect WhatsApp format', async () => {
      const whatsappContent = '[14/06/2025, 11:24] John Doe: Hey, how are you?';
      (readTextFile as any).mockResolvedValue(whatsappContent);

      const result = await importer.validateFile('/path/to/whatsapp.txt');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('whatsapp');
    });

    it('should reject invalid file format', async () => {
      (readTextFile as any).mockResolvedValue('invalid content');

      const result = await importer.validateFile('/path/to/invalid.txt');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported file format');
    });

    it('should handle file read errors', async () => {
      (readTextFile as any).mockRejectedValue(new Error('File not found'));

      const result = await importer.validateFile('/path/to/missing.json');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File read error');
    });
  });

  describe('File Import', () => {
    it('should import ChatGPT file successfully', async () => {
      (readTextFile as any).mockResolvedValue(mockChatGPTContent);

      const result = await importer.importFile('/path/to/chatgpt.json');
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.conversations[0].source_app).toBe('ChatGPT');
    });

    it('should import Claude file successfully', async () => {
      (readTextFile as any).mockResolvedValue(mockClaudeContent);

      const result = await importer.importFile('/path/to/claude.json');
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.conversations[0].source_app).toBe('Claude');
    });

    it('should import Gemini standard format successfully', async () => {
      (readTextFile as any).mockResolvedValue(mockGeminiStandardContent);

      const result = await importer.importFile('/path/to/gemini-standard.json');
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.conversations[0].source_app).toBe('Google Gemini');
    });

    it('should import Gemini Takeout format successfully', async () => {
      (readTextFile as any).mockResolvedValue(mockGeminiTakeoutContent);

      const result = await importer.importFile('/path/to/gemini-takeout.json');
      
      expect(result.conversations).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.conversations[0].source_app).toBe('Google Gemini');
    });

    it('should import multiple files with different formats', async () => {
      (readTextFile as any).mockImplementation((path) => {
        if (path.includes('chatgpt')) {
          return Promise.resolve(mockChatGPTContent);
        } else if (path.includes('claude')) {
          return Promise.resolve(mockClaudeContent);
        } else if (path.includes('gemini-standard')) {
          return Promise.resolve(mockGeminiStandardContent);
        } else if (path.includes('gemini-takeout')) {
          return Promise.resolve(mockGeminiTakeoutContent);
        }
        return Promise.reject(new Error('Unknown file'));
      });

      const files = [
        '/path/to/chatgpt.json',
        '/path/to/claude.json',
        '/path/to/gemini-standard.json',
        '/path/to/gemini-takeout.json'
      ];
      const result = await importer.importFiles(files);
      
      expect(result.conversations).toHaveLength(4);
      expect(result.messages).toHaveLength(4);
      expect(result.conversations[0].source_app).toBe('ChatGPT');
      expect(result.conversations[1].source_app).toBe('Claude');
      expect(result.conversations[2].source_app).toBe('Google Gemini');
      expect(result.conversations[3].source_app).toBe('Google Gemini');
    });

    it('should handle import errors gracefully', async () => {
      (readTextFile as any).mockImplementation((path) => {
        if (path.includes('valid')) {
          return Promise.resolve(mockChatGPTContent);
        }
        return Promise.reject(new Error('Read error'));
      });

      const files = ['/path/to/valid.json', '/path/to/invalid.json'];
      const result = await importer.importFiles(files);
      
      expect(result.conversations).toHaveLength(1); // Only valid file imported
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle unsupported file types', async () => {
      (readTextFile as any).mockResolvedValue('unsupported content format');

      const result = await importer.importFile('/path/to/unsupported.json');
      
      expect(result.conversations).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
      expect(result.errors).toContain('Unsupported file format');
    });
  });

  describe('Format Detection Priority', () => {
    it('should prioritize ChatGPT detection over other formats', async () => {
      // Create a file that could potentially match multiple formats
      const ambiguousContent = JSON.stringify({
        conversation_id: 'test-123',
        title: 'Test',
        mapping: {},
        uuid: 'also-has-uuid',
        chat_messages: [],
        conversations: []
      });
      
      (readTextFile as any).mockResolvedValue(ambiguousContent);

      const result = await importer.validateFile('/path/to/ambiguous.json');
      
      // Should detect as ChatGPT since it's checked first
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('chatgpt');
    });

    it('should fall back to Claude detection when ChatGPT fails', async () => {
      const claudeOnlyContent = JSON.stringify({
        uuid: 'claude-123',
        name: 'Claude Chat',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T11:45:00.000Z',
        chat_messages: []
      });
      
      (readTextFile as any).mockResolvedValue(claudeOnlyContent);

      const result = await importer.validateFile('/path/to/claude-only.json');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('claude');
    });

    it('should fall back to Gemini detection when others fail', async () => {
      const geminiOnlyContent = JSON.stringify({
        conversations: [{
          conversation_id: 'gemini-123',
          create_time: '2024-01-15T10:30:00.000Z',
          update_time: '2024-01-15T11:45:00.000Z',
          messages: []
        }]
      });
      
      (readTextFile as any).mockResolvedValue(geminiOnlyContent);

      const result = await importer.validateFile('/path/to/gemini-only.json');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('gemini');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation failures gracefully', async () => {
      (readTextFile as any).mockResolvedValue('{}'); // Empty object

      const result = await importer.importFile('/path/to/empty.json');
      
      expect(result.conversations).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle parser exceptions', async () => {
      (readTextFile as any).mockResolvedValue(mockGeminiStandardContent);
      
      // Mock parser to throw an error
      const originalParseGemini = importer['geminiParser'].parseGemini;
      importer['geminiParser'].parseGemini = vi.fn().mockRejectedValue(new Error('Parser error'));

      const result = await importer.importFile('/path/to/gemini.json');
      
      expect(result.conversations).toHaveLength(0);
      expect(result.errors).toContain('Import failed: Error: Parser error');
      
      // Restore original method
      importer['geminiParser'].parseGemini = originalParseGemini;
    });

    it('should handle malformed JSON gracefully', async () => {
      (readTextFile as any).mockResolvedValue('{ invalid json }');

      const result = await importer.importFile('/path/to/malformed.json');
      
      expect(result.conversations).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});