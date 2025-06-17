#!/usr/bin/env node

/**
 * Constraint Validation Script for "That's What I Said"
 * Validates code compliance with CoDA (Constraint Driven Architecture) principles
 * 
 * Usage: npm run constraint:validate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConstraintValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.projectRoot = path.resolve(__dirname, '..');
  }

  /**
   * Main validation entry point
   */
  async validate() {
    console.log('🔍 Starting CoDA Constraint Validation...\n');

    // Load constraint files
    const constraints = await this.loadConstraints();
    
    // Run validation checks
    await this.validateSecurityConstraints();
    await this.validateLocalOnlyConstraints();
    await this.validateEncryptionConstraints();
    await this.validateTestCoverage();
    await this.validateDocumentation();
    await this.validateFileStructure();

    // Report results
    this.reportResults();
    
    // Exit with appropriate code
    process.exit(this.errors.length > 0 ? 1 : 0);
  }

  /**
   * Load constraint files from ai-constraints directory
   */
  async loadConstraints() {
    const constraintPath = path.join(this.projectRoot, 'ai-constraints', '.ai-constraints.md');
    
    if (!fs.existsSync(constraintPath)) {
      this.errors.push('❌ Missing .ai-constraints.md file');
      return null;
    }

    const content = fs.readFileSync(constraintPath, 'utf8');
    console.log('✅ Loaded constraint definitions');
    return content;
  }

  /**
   * Validate security-first constraints
   */
  async validateSecurityConstraints() {
    console.log('🔒 Validating security constraints...');

    // Check for dangerous patterns
    const sourceFiles = this.getAllSourceFiles();
    
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for banned patterns
      if (content.includes('eval(')) {
        this.errors.push(`❌ Security violation: eval() found in ${file}`);
      }
      
      if (content.includes('Function(')) {
        this.errors.push(`❌ Security violation: Function constructor found in ${file}`);
      }
      
      if (content.includes('innerHTML')) {
        this.warnings.push(`⚠️  Potential security risk: innerHTML found in ${file}`);
      }
      
      // Check for hardcoded secrets
      if (content.match(/password\s*[:=]\s*["'][^"']+["']/i)) {
        this.errors.push(`❌ Security violation: Hardcoded password in ${file}`);
      }
      
      if (content.match(/api[_-]?key\s*[:=]\s*["'][^"']+["']/i)) {
        this.errors.push(`❌ Security violation: Hardcoded API key in ${file}`);
      }
    }
  }

  /**
   * Validate local-only constraints
   */
  async validateLocalOnlyConstraints() {
    console.log('🏠 Validating local-only constraints...');

    const sourceFiles = this.getAllSourceFiles();
    
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for network calls
      const networkPatterns = [
        /fetch\s*\(/,
        /axios\./,
        /http\.get/,
        /xhr\./,
        /XMLHttpRequest/,
        /navigator\.sendBeacon/
      ];
      
      for (const pattern of networkPatterns) {
        if (pattern.test(content)) {
          this.errors.push(`❌ Local-only violation: Network call pattern found in ${file}`);
        }
      }
      
      // Check for external URLs (excluding fonts and CDN for dev)
      const urlPattern = /https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/g;
      const matches = content.match(urlPattern);
      if (matches && matches.length > 0) {
        this.warnings.push(`⚠️  External URL found in ${file}: ${matches.join(', ')}`);
      }
    }
  }

  /**
   * Validate encryption constraints
   */
  async validateEncryptionConstraints() {
    console.log('🔐 Validating encryption constraints...');

    const cryptoFile = path.join(this.projectRoot, 'src', 'lib', 'crypto.ts');
    
    if (!fs.existsSync(cryptoFile)) {
      this.errors.push('❌ Missing crypto.ts file');
      return;
    }

    const content = fs.readFileSync(cryptoFile, 'utf8');
    
    // Check for required encryption methods
    const requiredMethods = [
      'AES.encrypt',
      'PBKDF2',
      'generateHash',
      'constantTimeCompare'
    ];
    
    for (const method of requiredMethods) {
      if (!content.includes(method)) {
        this.errors.push(`❌ Encryption constraint: Missing ${method} in crypto service`);
      }
    }
    
    // Check for proper key derivation
    if (!content.includes('100000')) { // High iteration count
      this.warnings.push('⚠️  PBKDF2 iteration count should be >= 100,000');
    }
  }

  /**
   * Validate test coverage requirements
   */
  async validateTestCoverage() {
    console.log('🧪 Validating test coverage...');

    const testDir = path.join(this.projectRoot, 'src', 'tests');
    
    if (!fs.existsSync(testDir)) {
      this.errors.push('❌ Missing tests directory');
      return;
    }

    const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));
    const sourceFiles = this.getAllSourceFiles().filter(f => 
      f.includes('/lib/') && !f.includes('.test.') && !f.includes('.spec.')
    );

    // Check that major modules have tests
    const criticalModules = [
      'crypto.ts',
      'database.ts',
      'fileImporter.ts',
      'chatgpt.ts',
      'claude.ts'
    ];

    for (const module of criticalModules) {
      const hasTest = testFiles.some(test => test.includes(module.replace('.ts', '')));
      if (!hasTest) {
        this.errors.push(`❌ Missing tests for critical module: ${module}`);
      }
    }

    console.log(`   Found ${testFiles.length} test files for ${sourceFiles.length} source files`);
  }

  /**
   * Validate documentation requirements
   */
  async validateDocumentation() {
    console.log('📚 Validating documentation...');

    // Check for JSDoc comments in critical files
    const criticalFiles = [
      'src/lib/crypto.ts',
      'src/lib/database.ts',
      'src/lib/types.ts'
    ];

    for (const file of criticalFiles) {
      const fullPath = path.join(this.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const jsdocCount = (content.match(/\/\*\*/g) || []).length;
        
        if (jsdocCount < 3) {
          this.warnings.push(`⚠️  Low JSDoc coverage in ${file} (${jsdocCount} blocks)`);
        }
      }
    }

    // Check for README
    const readmePath = path.join(this.projectRoot, 'README.md');
    if (!fs.existsSync(readmePath)) {
      this.errors.push('❌ Missing README.md');
    }
  }

  /**
   * Validate project file structure
   */
  async validateFileStructure() {
    console.log('📁 Validating file structure...');

    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'tailwind.config.js',
      'src/app.html',
      'src/lib/types.ts',
      'ai-constraints/.ai-constraints.md'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(this.projectRoot, file);
      if (!fs.existsSync(fullPath)) {
        this.errors.push(`❌ Missing required file: ${file}`);
      }
    }

    const requiredDirs = [
      'src/lib',
      'src/lib/parsers',
      'src/lib/components',
      'docs',
      'ai-constraints'
    ];

    for (const dir of requiredDirs) {
      const fullPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        this.errors.push(`❌ Missing required directory: ${dir}`);
      }
    }
  }

  /**
   * Get all TypeScript/JavaScript source files
   */
  getAllSourceFiles() {
    const files = [];
    
    const searchDirs = [
      path.join(this.projectRoot, 'src'),
    ];

    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        this.addFilesRecursively(dir, files, ['.ts', '.js', '.svelte']);
      }
    }

    return files;
  }

  /**
   * Recursively add files with specific extensions
   */
  addFilesRecursively(dir, files, extensions) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        this.addFilesRecursively(fullPath, files, extensions);
      } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  /**
   * Report validation results
   */
  reportResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONSTRAINT VALIDATION RESULTS');
    console.log('='.repeat(60));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('🎉 All constraints satisfied! CoDA compliance verified.');
    } else {
      if (this.errors.length > 0) {
        console.log(`\n❌ ERRORS (${this.errors.length}):`);
        this.errors.forEach(error => console.log(`   ${error}`));
      }

      if (this.warnings.length > 0) {
        console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
        this.warnings.forEach(warning => console.log(`   ${warning}`));
      }
    }

    console.log('\n' + '='.repeat(60));
    
    if (this.errors.length > 0) {
      console.log('❌ Constraint validation FAILED');
      console.log('Please fix the errors above before proceeding.');
    } else {
      console.log('✅ Constraint validation PASSED');
      if (this.warnings.length > 0) {
        console.log('Consider addressing the warnings for optimal compliance.');
      }
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ConstraintValidator();
  validator.validate().catch(console.error);
}

export default ConstraintValidator;