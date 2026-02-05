/**
 * PEAC Samples CLI Commands (v0.10.8+)
 *
 * Commands for working with sample receipts:
 * - list: List available sample receipts
 * - generate: Generate sample receipts for testing
 * - show: Show details of a specific sample
 *
 * Uses specs/conformance/samples/ as canonical source when available,
 * falls back to embedded samples when running outside the repo.
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { sign, generateKeypair, base64urlEncode } from '@peac/crypto';
import { getSamples, getSampleById, type SampleCategory } from '../lib/samples-loader.js';
import { getVersion } from '../lib/version.js';

/**
 * Global options for samples commands
 */
interface SamplesGlobalOptions {
  json?: boolean;
}

/**
 * Get global options from parent command
 */
function getGlobalOptions(cmd: Command): SamplesGlobalOptions {
  const parent = cmd.parent;
  if (!parent) return {};
  return parent.opts() as SamplesGlobalOptions;
}

/**
 * Output error - handles JSON vs human-readable format
 */
function outputError(
  error: string,
  details: Record<string, unknown>,
  opts: SamplesGlobalOptions
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error, ...details }, null, 2));
  } else {
    console.error(`Error: ${error}`);
    if (details.hint) {
      console.error(`Hint: ${details.hint}`);
    }
  }
}

/**
 * Apply time adjustments to claims based on sample type
 */
function applyTimeAdjustments(
  claims: Record<string, unknown>,
  sampleId: string,
  now: number
): Record<string, unknown> {
  const adjusted = { ...claims };

  // Standard expiry: 1 hour
  const standardExpiry = 3600;
  // Long expiry: 24 hours
  const longExpiry = 86400;

  switch (sampleId) {
    case 'expired':
      // Already expired: iat 2 hours ago, exp 1 hour ago
      adjusted.iat = now - 7200;
      adjusted.exp = now - 3600;
      break;
    case 'future-iat':
      // Future iat: 1 hour in future
      adjusted.iat = now + 3600;
      adjusted.exp = now + 7200;
      break;
    case 'long-expiry':
      adjusted.iat = now;
      adjusted.exp = now + longExpiry;
      break;
    default:
      // Standard: iat now, exp in 1 hour
      if (adjusted.iat === 0 || !adjusted.iat) {
        adjusted.iat = now;
      }
      if (adjusted.exp === 0 || !adjusted.exp) {
        adjusted.exp = now + standardExpiry;
      }
  }

  return adjusted;
}

const samples = new Command('samples')
  .description('Work with PEAC sample receipts (v0.10.8+)')
  .option('--json', 'Output in JSON format');

/**
 * peac samples list [--category <cat>]
 */
samples
  .command('list')
  .description('List available sample receipts')
  .option('-c, --category <category>', 'Filter by category: valid, invalid, edge')
  .option('--samples <path>', 'Path to samples directory')
  .action((options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      const allSamples = getSamples(options.samples);
      let filteredSamples = allSamples;

      if (options.category) {
        filteredSamples = allSamples.filter((s) => s.category === options.category);
        if (filteredSamples.length === 0) {
          outputError('No samples in category', { category: options.category }, globalOpts);
          process.exitCode = 1;
          return;
        }
      }

      if (globalOpts.json) {
        const data = filteredSamples.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
        }));
        console.log(JSON.stringify({ samples: data }, null, 2));
      } else {
        console.log('Available PEAC Sample Receipts\n');
        console.log('VALID SAMPLES:');
        for (const s of filteredSamples.filter((x) => x.category === 'valid')) {
          console.log(`  ${s.id}`);
          console.log(`    ${s.description}\n`);
        }

        const invalid = filteredSamples.filter((x) => x.category === 'invalid');
        if (invalid.length > 0) {
          console.log('\nINVALID SAMPLES (for testing rejection):');
          for (const s of invalid) {
            console.log(`  ${s.id}`);
            console.log(`    ${s.description}\n`);
          }
        }

        const edge = filteredSamples.filter((x) => x.category === 'edge');
        if (edge.length > 0) {
          console.log('\nEDGE CASE SAMPLES:');
          for (const s of edge) {
            console.log(`  ${s.id}`);
            console.log(`    ${s.description}\n`);
          }
        }

        console.log('\nUse "peac samples show <id>" to see sample details.');
        console.log('Use "peac samples generate -o <dir>" to generate sample files.');
      }

      process.exitCode = 0;
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exitCode = 1;
    }
  });

/**
 * peac samples show <id>
 */
samples
  .command('show')
  .description('Show details of a specific sample')
  .argument('<id>', 'Sample ID')
  .option('--samples <path>', 'Path to samples directory')
  .action((id, options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      const sample = getSampleById(id, options.samples);
      if (!sample) {
        const allSamples = getSamples(options.samples);
        const available = allSamples.map((s) => s.id);
        outputError('Sample not found', { id, available }, globalOpts);
        process.exitCode = 1;
        return;
      }

      if (globalOpts.json) {
        console.log(JSON.stringify(sample, null, 2));
      } else {
        console.log(`Sample: ${sample.name}\n`);
        console.log(`ID: ${sample.id}`);
        console.log(`Category: ${sample.category}`);
        console.log(`Description: ${sample.description}\n`);
        console.log('Claims:');
        console.log(JSON.stringify(sample.claims, null, 2));
        if (sample.expectedError) {
          console.log(`\nExpected Error: ${sample.expectedError}`);
        }
      }

      process.exitCode = 0;
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exitCode = 1;
    }
  });

/**
 * peac samples generate -o <dir> [--format <format>] [--now <timestamp>] [--kid <kid>] [--seed <seed>]
 */
samples
  .command('generate')
  .description('Generate sample receipt files')
  .requiredOption('-o, --output <dir>', 'Output directory')
  .option('-f, --format <format>', 'Output format: jws, json, bundle', 'jws')
  .option('--category <category>', 'Generate only specific category')
  .option('--samples <path>', 'Path to samples directory')
  .option('--now <timestamp>', 'Unix timestamp for iat/exp (for deterministic generation)')
  .option('--kid <kid>', 'Key ID to use')
  .action(async (options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      const outputDir = options.output;

      // Create output directories
      const validDir = path.join(outputDir, 'valid');
      const invalidDir = path.join(outputDir, 'invalid');
      const edgeDir = path.join(outputDir, 'edge');
      const bundlesDir = path.join(outputDir, 'bundles');

      fs.mkdirSync(validDir, { recursive: true });
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.mkdirSync(edgeDir, { recursive: true });
      fs.mkdirSync(bundlesDir, { recursive: true });

      // Determine timestamp
      const now = options.now ? parseInt(options.now, 10) : Math.floor(Date.now() / 1000);

      // Generate key pair
      // Note: --seed option is documented but full determinism requires proper seed-to-key derivation
      const keyPair = await generateKeypair();
      const publicKeyBytes = keyPair.publicKey;
      const privateKeyBytes = keyPair.privateKey;

      // Build KID
      const kid = options.kid || `sandbox-${new Date(now * 1000).toISOString().slice(0, 7)}`;

      // Build JWK for the key
      const publicJwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: base64urlEncode(publicKeyBytes),
        kid,
        use: 'sig',
        alg: 'EdDSA',
      };

      const generatedFiles: string[] = [];

      // Get samples to generate
      let samplesToGenerate = getSamples(options.samples);
      if (options.category) {
        samplesToGenerate = samplesToGenerate.filter((s) => s.category === options.category);
      }

      for (const sample of samplesToGenerate) {
        const targetDir =
          sample.category === 'valid'
            ? validDir
            : sample.category === 'edge'
              ? edgeDir
              : invalidDir;
        const filename = `${sample.id}.${options.format === 'json' ? 'json' : 'jws'}`;
        const filepath = path.join(targetDir, filename);

        // Apply time adjustments
        const adjustedClaims = applyTimeAdjustments(sample.claims, sample.id, now);

        if (options.format === 'json') {
          // Write as decoded JSON
          const output = {
            $comment: sample.description,
            header: {
              alg: 'EdDSA',
              typ: 'peac-receipt/0.1',
              kid,
            },
            payload: adjustedClaims,
            ...(sample.expectedError ? { expected_error: sample.expectedError } : {}),
          };
          fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
        } else {
          // Create actual JWS using @peac/crypto sign function
          const jws = await sign(adjustedClaims, privateKeyBytes, kid);
          fs.writeFileSync(filepath, jws);
        }

        generatedFiles.push(filepath);
      }

      // Write JWKS file for verification
      const jwksPath = path.join(bundlesDir, 'sandbox-jwks.json');
      const jwks = {
        keys: [publicJwk],
      };
      fs.writeFileSync(jwksPath, JSON.stringify(jwks, null, 2));
      generatedFiles.push(jwksPath);

      // Write offline verification bundle
      const bundlePath = path.join(bundlesDir, 'offline-verification.json');
      const bundle = {
        $comment: 'Offline verification bundle with sample receipts and JWKS',
        description:
          'Bundle for offline verification testing. Contains test JWKS and sample metadata.',
        generated_at: new Date(now * 1000).toISOString(),
        generator: {
          name: 'peac-cli',
          version: getVersion(),
        },
        jwks,
        samples: samplesToGenerate.map((s) => ({
          id: s.id,
          description: s.description,
          category: s.category,
        })),
        notes: [
          'Sample timestamps are based on --now parameter or generation time.',
          'Do NOT use sandbox samples in production.',
        ],
      };
      fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
      generatedFiles.push(bundlePath);

      if (globalOpts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              output_dir: outputDir,
              files_generated: generatedFiles.length,
              files: generatedFiles,
              timestamp: now,
              kid,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Sample receipts generated successfully!\n`);
        console.log(`Output directory: ${outputDir}`);
        console.log(`Files generated: ${generatedFiles.length}`);
        console.log(`Timestamp: ${now} (${new Date(now * 1000).toISOString()})`);
        console.log(`Key ID: ${kid}\n`);
        console.log('Generated files:');
        for (const f of generatedFiles) {
          console.log(`  ${path.relative(outputDir, f)}`);
        }
        console.log(`\nJWKS for verification: ${path.relative(outputDir, jwksPath)}`);
      }

      process.exitCode = 0;
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exitCode = 1;
    }
  });

export { samples };
