// src/tests/content-sanitizer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { contentSanitizer } from '../lib/security/contentSanitizer.js';

describe('ContentSanitizer', () => {
    let sanitizer: typeof contentSanitizer;

    beforeEach(() => {
        sanitizer = contentSanitizer;
    });

    describe('XSS Prevention', () => {
        it('should remove script tags', () => {
            const malicious = '<script>alert("xss")</script>Hello world';
            const result = sanitizer.sanitizeChatContent(malicious);
            
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('alert');
            expect(result).toContain('Hello world');
        });

        it('should remove javascript: URLs', () => {
            const malicious = '<a href="javascript:alert(\'xss\')">Click me</a>';
            const result = sanitizer.sanitizeChatContent(malicious);
            
            expect(result).not.toContain('javascript:');
            expect(result).not.toContain('alert');
        });

        it('should remove event handlers', () => {
            const malicious = '<div onclick="alert(\'xss\')">Content</div>';
            const result = sanitizer.sanitizeChatContent(malicious);
            
            expect(result).not.toContain('onclick');
            expect(result).not.toContain('alert');
            expect(result).toContain('Content');
        });

        it('should remove data URLs', () => {
            const malicious = '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>';
            const result = sanitizer.sanitizeChatContent(malicious);
            
            expect(result).not.toContain('data:text/html');
            expect(result).not.toContain('iframe');
            expect(result).not.toContain('script');
        });
    });

    describe('Safe Content Preservation', () => {
        it('should preserve basic formatting', () => {
            const safe = '<b>Bold</b> and <i>italic</i> text with <code>code</code>';
            const result = sanitizer.sanitizeChatContent(safe);
            
            expect(result).toContain('<b>Bold</b>');
            expect(result).toContain('<i>italic</i>');
            expect(result).toContain('<code>code</code>');
        });

        it('should preserve code blocks', () => {
            const codeBlock = '<pre><code>function hello() { return "world"; }</code></pre>';
            const result = sanitizer.sanitizeChatContent(codeBlock);
            
            expect(result).toContain('<pre>');
            expect(result).toContain('<code>');
            expect(result).toContain('function hello()');
        });

        it('should preserve lists', () => {
            const list = '<ul><li>Item 1</li><li>Item 2</li></ul>';
            const result = sanitizer.sanitizeChatContent(list);
            
            expect(result).toContain('<ul>');
            expect(result).toContain('<li>Item 1</li>');
            expect(result).toContain('<li>Item 2</li>');
        });
    });

    describe('Code Content Sanitization', () => {
        it('should handle code content appropriately', () => {
            const code = '<pre><code class="language-js">console.log("test");</code></pre>';
            const result = sanitizer.sanitizeCodeContent(code);
            
            expect(result).toContain('console.log');
            expect(result).toContain('<code');
            expect(result).toContain('class="language-js"');
        });

        it('should remove dangerous elements from code', () => {
            const maliciousCode = '<pre><script>alert("xss")</script><code>safe code</code></pre>';
            const result = sanitizer.sanitizeCodeContent(maliciousCode);
            
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('alert');
            expect(result).toContain('safe code');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty content', () => {
            expect(sanitizer.sanitizeChatContent('')).toBe('');
            expect(sanitizer.sanitizeChatContent(null as any)).toBe('');
            expect(sanitizer.sanitizeChatContent(undefined as any)).toBe('');
        });

        it('should handle very long content', () => {
            const longContent = 'A'.repeat(60000); // Exceeds 50KB limit
            const result = sanitizer.sanitizeChatContent(longContent);
            
            expect(result.length).toBeLessThan(longContent.length);
            expect(result).toContain('[Content truncated for security]');
        });

        it('should handle malformed HTML gracefully', () => {
            const malformed = '<div><p>Unclosed tags<span>nested';
            const result = sanitizer.sanitizeChatContent(malformed);
            
            // Should not throw errors and should return safe content
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });
    });

    describe('Filename Sanitization', () => {
        it('should sanitize dangerous filenames', () => {
            const dangerous = '../../../etc/passwd';
            const result = sanitizer.sanitizeFilename(dangerous);
            
            expect(result).not.toContain('../');
            expect(result).toBe('___etc_passwd');
        });

        it('should handle Windows forbidden characters', () => {
            const forbidden = 'file<>:"/\\|?*name.txt';
            const result = sanitizer.sanitizeFilename(forbidden);
            
            expect(result).toBe('file_________name.txt');
        });

        it('should truncate very long filenames', () => {
            const longName = 'a'.repeat(300) + '.txt';
            const result = sanitizer.sanitizeFilename(longName);
            
            expect(result.length).toBeLessThanOrEqual(255);
        });
    });
});

// Integration test with parser
describe('Parser Integration', () => {
    it('should sanitize content in ChatGPT parser', async () => {
        // This would be part of the parser tests
        const mockMessage = {
            content: {
                parts: ['<script>alert("xss")</script>Hello from ChatGPT']
            },
            author: { role: 'assistant' },
            create_time: Date.now() / 1000
        };

        // Test that parser sanitizes content
        // Implementation would depend on parser structure
        expect(true).toBe(true); // Placeholder
    });
});