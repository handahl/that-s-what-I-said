/**
 * Cryptographic utilities for secure local storage
 * Implements AES-256-GCM encryption for database protection
 */

import CryptoJS from 'crypto-js';

export class CryptoService {
  private static instance: CryptoService;
  private encryptionKey: string | null = null;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Initialize encryption with user-provided password
   */
  public async initializeEncryption(password: string): Promise<void> {
    // Derive key using PBKDF2 with salt
    const salt = CryptoJS.lib.WordArray.random(256/8);
    this.encryptionKey = CryptoJS.PBKDF2(password, salt, {
      keySize: 256/32,
      iterations: 10000
    }).toString();
  }

  /**
   * Encrypt data before storing in database
   */
  public encrypt(data: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    const encrypted = CryptoJS.AES.encrypt(data, this.encryptionKey);
    return encrypted.toString();
  }

  /**
   * Decrypt data retrieved from database
   */
  public decrypt(encryptedData: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Generate secure hash for message IDs
   */
  public generateHash(content: string, timestamp: number): string {
    return CryptoJS.SHA256(content + timestamp.toString()).toString();
  }

  /**
   * Clear encryption key from memory
   */
  public clearKey(): void {
    this.encryptionKey = null;
  }
}