/**
 * Conformance Manifest Loading and Matching
 *
 * Handles loading manifest.json and retrieving fixture metadata.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Manifest, ManifestEntry } from './types.js';

/**
 * Load manifest.json from fixtures directory
 */
export function loadManifest(fixturesDir: string): Manifest {
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Get manifest entry for a fixture
 */
export function getManifestEntry(
  manifest: Manifest,
  category: string,
  filename: string
): ManifestEntry | undefined {
  return manifest[category]?.[filename];
}
