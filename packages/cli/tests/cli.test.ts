/**
 * CLI Integration Tests
 *
 * Verifies the CLI commands work correctly end-to-end.
 * These tests spawn the actual CLI and verify output.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const CLI_PATH = join(__dirname, '..', 'dist', 'index.js');
const TEST_OUTPUT_DIR = join(__dirname, '..', '.test-output');

/**
 * Run CLI command and return stdout
 */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      encoding: 'utf8',
      cwd: join(__dirname, '..', '..', '..'), // repo root
      stdio: ['pipe', 'pipe', 'pipe'], // Capture all output, silence stderr
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

describe('CLI Integration Tests', () => {
  beforeAll(() => {
    // Ensure CLI is built
    if (!existsSync(CLI_PATH)) {
      throw new Error('CLI not built. Run "pnpm build --filter=@peac/cli" first.');
    }

    // Create test output directory
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up test output
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  describe('peac --version', () => {
    it('should output version number', () => {
      const result = runCli(['--version']);
      expect(result.exitCode).toBe(0);
      // Version should be semver-like
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('peac samples', () => {
    it('samples list should show available samples', () => {
      const result = runCli(['samples', 'list']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('basic-receipt');
      expect(result.stdout).toContain('expired');
      expect(result.stdout).toContain('VALID SAMPLES');
    });

    it('samples list --json should output JSON', () => {
      const result = runCli(['samples', 'list', '--json']);
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.samples).toBeDefined();
      expect(Array.isArray(data.samples)).toBe(true);
      expect(data.samples.some((s: { id: string }) => s.id === 'basic-receipt')).toBe(true);
    });

    it('samples show should display sample details', () => {
      const result = runCli(['samples', 'show', 'basic-receipt']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('basic-receipt');
      expect(result.stdout).toContain('Claims:');
      expect(result.stdout).toContain('iss');
    });

    it('samples generate should create files', () => {
      const outputDir = join(TEST_OUTPUT_DIR, 'samples-test');
      const result = runCli(['samples', 'generate', '-o', outputDir]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sample receipts generated successfully');

      // Check files were created
      expect(existsSync(join(outputDir, 'valid'))).toBe(true);
      expect(existsSync(join(outputDir, 'invalid'))).toBe(true);
      expect(existsSync(join(outputDir, 'bundles', 'sandbox-jwks.json'))).toBe(true);
      expect(existsSync(join(outputDir, 'bundles', 'offline-verification.json'))).toBe(true);

      // Check valid samples exist
      const validFiles = readdirSync(join(outputDir, 'valid'));
      expect(validFiles.some((f) => f.includes('basic-receipt'))).toBe(true);
    });

    it('samples generate --now should use specified timestamp', () => {
      const outputDir = join(TEST_OUTPUT_DIR, 'samples-deterministic');
      const timestamp = 1700000000; // Fixed timestamp
      const result = runCli(['samples', 'generate', '-o', outputDir, '--now', String(timestamp)]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Timestamp: ${timestamp}`);
    });

    it('samples generate --kid should use specified kid', () => {
      const outputDir = join(TEST_OUTPUT_DIR, 'samples-kid');
      const kid = 'test-key-001';
      const result = runCli(['samples', 'generate', '-o', outputDir, '--kid', kid]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Key ID: ${kid}`);

      // Verify JWKS uses the kid
      const jwks = JSON.parse(
        readFileSync(join(outputDir, 'bundles', 'sandbox-jwks.json'), 'utf8')
      );
      expect(jwks.keys[0].kid).toBe(kid);
    });
  });

  describe('peac conformance', () => {
    it('conformance list should show categories', () => {
      const result = runCli(['conformance', 'list']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('conformance test categories');
      expect(result.stdout).toContain('valid');
      expect(result.stdout).toContain('invalid');
    });

    it('conformance list --json should output JSON', () => {
      const result = runCli(['conformance', 'list', '--json']);
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.categories).toBeDefined();
      expect(Array.isArray(data.categories)).toBe(true);
    });

    it('conformance run should execute tests', () => {
      const result = runCli(['conformance', 'run', '--level', 'basic']);
      // May pass or fail depending on fixtures, but should run
      expect(result.stdout).toContain('Conformance Test Results');
      expect(result.stdout).toContain('Passed:');
      expect(result.stdout).toContain('Failed:');
    });

    it('conformance run --output json should produce conformance report', () => {
      const result = runCli(['conformance', 'run', '--level', 'basic', '--output', 'json']);
      const report = JSON.parse(result.stdout);
      expect(report.report_version).toBe('peac-conformance-report/0.1');
      expect(report.suite).toBeDefined();
      expect(report.implementation).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.results).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('samples show with invalid ID should fail gracefully', () => {
      const result = runCli(['samples', 'show', 'nonexistent-sample']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Sample not found');
    });

    it('conformance list with invalid category should fail gracefully', () => {
      const result = runCli(['conformance', 'list', '-c', 'nonexistent-category']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Category not found');
    });
  });
});
