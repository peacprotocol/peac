/**
 * Profile Generator Tests
 *
 * Golden tests to ensure generated profiles.ts stays in sync with YAML sources.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PROFILES, PROFILE_IDS } from '../src';

describe('Profile Generator', () => {
  describe('generated profiles', () => {
    it('generated file exists', () => {
      const generatedPath = path.join(__dirname, '..', 'src', 'generated', 'profiles.ts');
      expect(fs.existsSync(generatedPath)).toBe(true);
    });

    it('generated file is up to date with YAML sources', () => {
      // Run the generator in check mode
      const result = execSync('pnpm generate:profiles:check', {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(result).toContain('Generated profiles are up to date');
    });

    it('exports expected profile IDs', () => {
      expect(PROFILE_IDS).toEqual(['api-provider', 'news-media', 'open-source', 'saas-docs']);
    });

    it('all profile IDs have corresponding YAML files', () => {
      const profilesDir = path.join(__dirname, '..', 'profiles');
      for (const id of PROFILE_IDS) {
        const yamlPath = path.join(profilesDir, `${id}.yaml`);
        expect(fs.existsSync(yamlPath)).toBe(true);
      }
    });

    it('no orphan YAML files in profiles directory', () => {
      const profilesDir = path.join(__dirname, '..', 'profiles');
      const yamlFiles = fs
        .readdirSync(profilesDir)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map((f) => f.replace(/\.(yaml|yml)$/, ''));

      // All YAML files should have corresponding profile IDs
      for (const file of yamlFiles) {
        expect(PROFILE_IDS).toContain(file);
      }
    });
  });

  describe('profile structure validation', () => {
    it('all profiles have required fields', () => {
      for (const id of PROFILE_IDS) {
        const profile = PROFILES[id];
        expect(profile.id).toBe(id);
        expect(profile.name).toBeTruthy();
        expect(profile.description).toBeTruthy();
        expect(profile.policy).toBeDefined();
        expect(profile.policy.version).toBe('peac-policy/0.1');
        expect(profile.policy.defaults).toBeDefined();
        expect(profile.policy.defaults.decision).toBeDefined();
      }
    });

    it('all profiles have valid decisions', () => {
      const validDecisions = ['allow', 'deny', 'review'];
      for (const id of PROFILE_IDS) {
        const profile = PROFILES[id];
        expect(validDecisions).toContain(profile.policy.defaults.decision);

        for (const rule of profile.policy.rules || []) {
          expect(validDecisions).toContain(rule.decision);
        }
      }
    });

    it('all profiles with rules have named rules', () => {
      for (const id of PROFILE_IDS) {
        const profile = PROFILES[id];
        for (const rule of profile.policy.rules || []) {
          expect(rule.name).toBeTruthy();
        }
      }
    });

    it('profiles with receipt requirement have defaults.requirements', () => {
      for (const id of PROFILE_IDS) {
        const profile = PROFILES[id];
        // If any rule has review decision, profile should have requirements
        const hasReviewRule = profile.policy.rules?.some((r) => r.decision === 'review');
        if (hasReviewRule) {
          expect(profile.defaults?.requirements?.receipt).toBe(true);
        }
      }
    });
  });

  describe('deterministic output', () => {
    it('generator produces identical output on repeated runs', () => {
      const cwd = path.join(__dirname, '..');

      // Read current generated file
      const generatedPath = path.join(cwd, 'src', 'generated', 'profiles.ts');
      const before = fs.readFileSync(generatedPath, 'utf-8');

      // Regenerate
      execSync('pnpm generate:profiles', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Read again
      const after = fs.readFileSync(generatedPath, 'utf-8');

      // Should be identical
      expect(after).toBe(before);
    });
  });

  describe('golden vectors', () => {
    it('news-media profile has expected structure', () => {
      const profile = PROFILES['news-media'];
      expect(profile.name).toBe('News Media Publisher');
      expect(profile.policy.defaults.decision).toBe('deny');
      expect(profile.policy.rules?.length).toBe(3);
      expect(profile.defaults?.requirements?.receipt).toBe(true);
      expect(profile.defaults?.rate_limit?.limit).toBe(100);
      expect(profile.defaults?.rate_limit?.window_seconds).toBe(3600);
    });

    it('open-source profile has expected structure', () => {
      const profile = PROFILES['open-source'];
      expect(profile.name).toBe('Open Source Project');
      expect(profile.policy.defaults.decision).toBe('allow');
      expect(profile.policy.rules?.length).toBe(0);
      expect(profile.defaults?.requirements?.receipt).toBeUndefined();
    });

    it('api-provider profile has expected structure', () => {
      const profile = PROFILES['api-provider'];
      expect(profile.name).toBe('API Provider');
      expect(profile.policy.defaults.decision).toBe('deny');
      expect(profile.defaults?.requirements?.receipt).toBe(true);
      expect(profile.parameters?.contact?.required).toBe(true);
    });

    it('saas-docs profile has expected structure', () => {
      const profile = PROFILES['saas-docs'];
      expect(profile.name).toBe('SaaS Documentation');
      expect(profile.policy.defaults.decision).toBe('allow');
      expect(profile.policy.rules?.length).toBe(1);
      expect(profile.policy.rules?.[0].name).toBe('block-training');
    });
  });
});
