/**
 * PEAC Samples CLI Commands (v0.10.8+)
 *
 * Commands for working with sample records:
 * - list: List available sample records
 * - generate: Generate sample records for testing
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
import { sign, generateKeypair, base64urlEncode, decode } from '@peac/crypto';
import { issue } from '@peac/protocol';
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
  .description('Work with PEAC sample records (v0.10.8+)')
  .option('--json', 'Output in JSON format');

/**
 * peac samples list [--category <cat>]
 */
samples
  .command('list')
  .description('List available sample records')
  .option('-c, --category <category>', 'Filter by category: valid, invalid, edge')
  .option('--samples <path>', 'Path to samples directory')
  .action((options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      if (
        options.category !== undefined &&
        !['valid', 'invalid', 'edge'].includes(options.category)
      ) {
        outputError(
          'Unknown sample category',
          { category: options.category, supported: ['valid', 'invalid', 'edge'] },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

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
        console.log('Available PEAC Sample Records\n');
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
        if (sample.category === 'valid') {
          console.log('Issue input (current PEAC signed interaction record):');
          console.log(JSON.stringify(sample.input, null, 2));
        } else {
          console.log('Claims (legacy rejection fixture):');
          console.log(JSON.stringify(sample.claims, null, 2));
          if (sample.expectedError) {
            console.log(`\nExpected Error: ${sample.expectedError}`);
          }
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
  .description('Generate sample record files')
  .requiredOption('-o, --output <dir>', 'Output directory')
  .option('-f, --format <format>', 'Output format: jws, json', 'jws')
  .option('--category <category>', 'Generate only specific category')
  .option('--samples <path>', 'Path to samples directory')
  .option(
    '--now <timestamp>',
    'Unix event time (seconds) for valid samples; sets occurred_at (must not be in the future)'
  )
  .option('--kid <kid>', 'Key ID to use')
  .action(async (options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      const outputDir = options.output;

      // Validate ALL inputs before any filesystem side effects.

      // 1. Output format: only jws and json are sample file formats. The
      //    offline metadata bundle is always written under bundles/.
      const allowedFormats = new Set(['jws', 'json']);
      if (!allowedFormats.has(options.format)) {
        outputError(
          'Unsupported sample format',
          { format: options.format, supported: ['jws', 'json'] },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // 2. Category enum (when provided).
      const allowedCategories = new Set(['valid', 'invalid', 'edge']);
      if (options.category !== undefined && !allowedCategories.has(options.category)) {
        outputError(
          'Unknown sample category',
          { category: options.category, supported: ['valid', 'invalid', 'edge'] },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // 3. Select samples and fail if nothing matches.
      let samplesToGenerate = getSamples(options.samples);
      if (options.category) {
        samplesToGenerate = samplesToGenerate.filter((s) => s.category === options.category);
      }
      if (samplesToGenerate.length === 0) {
        outputError(
          'No samples selected to generate',
          { category: options.category ?? null },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // 4. --now is an optional integer event time (seconds) for valid samples.
      let eventTime: number | undefined;
      if (options.now !== undefined) {
        const parsed = Number(options.now);
        if (!Number.isInteger(parsed)) {
          outputError(
            '--now must be an integer Unix timestamp (seconds)',
            { now: options.now },
            globalOpts
          );
          process.exitCode = 1;
          return;
        }
        // An integer can still be out of the supported Date range (e.g. a huge
        // negative value), which would later throw when formatting occurred_at.
        // Reject it here, before any filesystem writes, with a clear message.
        if (!Number.isFinite(new Date(parsed * 1000).getTime())) {
          outputError(
            '--now is outside the supported date range',
            { now: options.now },
            globalOpts
          );
          process.exitCode = 1;
          return;
        }
        eventTime = parsed;
      }

      // 5. A future occurred_at would be rejected by local verification
      //    (E_OCCURRED_AT_FUTURE), so reject a future --now up front when
      //    valid samples are selected.
      const generationNow = Math.floor(Date.now() / 1000);
      const SKEW_SECONDS = 300;
      const generatesValid = samplesToGenerate.some((s) => s.category === 'valid');
      if (eventTime !== undefined && generatesValid && eventTime > generationNow + SKEW_SECONDS) {
        outputError(
          '--now sets occurred_at (event time) for valid samples and must not be in the future',
          { now: eventTime, wall_clock: generationNow, skew_seconds: SKEW_SECONDS },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // Inputs validated. Create output directories.
      const validDir = path.join(outputDir, 'valid');
      const invalidDir = path.join(outputDir, 'invalid');
      const edgeDir = path.join(outputDir, 'edge');
      const bundlesDir = path.join(outputDir, 'bundles');

      fs.mkdirSync(validDir, { recursive: true });
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.mkdirSync(edgeDir, { recursive: true });
      fs.mkdirSync(bundlesDir, { recursive: true });

      // Generate key pair
      const keyPair = await generateKeypair();
      const publicKeyBytes = keyPair.publicKey;
      const privateKeyBytes = keyPair.privateKey;

      // Build KID. The default kid is derived from generation time, not the
      // event time, since --now is the interaction time (occurred_at).
      const kid =
        options.kid || `sandbox-${new Date(generationNow * 1000).toISOString().slice(0, 7)}`;

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

      for (const sample of samplesToGenerate) {
        const targetDir =
          sample.category === 'valid'
            ? validDir
            : sample.category === 'edge'
              ? edgeDir
              : invalidDir;
        const filename = `${sample.id}.${options.format === 'json' ? 'json' : 'jws'}`;
        const filepath = path.join(targetDir, filename);

        if (sample.category === 'valid') {
          // Valid samples are current PEAC signed interaction records issued
          // via issue(). iat is issuance time; --now maps to occurred_at (the
          // interaction/event time), so generated bytes are not deterministic.
          // The recipe `input` is untyped JSON; issue() validates it at
          // runtime (throws IssueError on malformed input). Cast through
          // unknown to the issue() options type.
          const issueOptions = {
            ...sample.input,
            privateKey: privateKeyBytes,
            kid,
            ...(eventTime !== undefined
              ? { occurred_at: new Date(eventTime * 1000).toISOString() }
              : {}),
          } as unknown as Parameters<typeof issue>[0];
          const { jws } = await issue(issueOptions);
          if (options.format === 'json') {
            const { header, payload } = decode(jws);
            fs.writeFileSync(
              filepath,
              JSON.stringify({ $comment: sample.description, header, payload }, null, 2)
            );
          } else {
            fs.writeFileSync(filepath, jws);
          }
        } else {
          // Invalid / edge samples remain raw legacy claims (rejection
          // fixtures), signed directly so they can carry intentionally invalid
          // shapes that issue() would refuse to produce.
          const adjustedClaims = applyTimeAdjustments(sample.claims, sample.id, generationNow);
          if (options.format === 'json') {
            const output = {
              $comment: sample.description,
              header: { alg: 'EdDSA', typ: 'interaction-record+jwt', kid },
              payload: adjustedClaims,
              ...(sample.expectedError ? { expected_error: sample.expectedError } : {}),
            };
            fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
          } else {
            const jws = await sign(adjustedClaims, privateKeyBytes, kid);
            fs.writeFileSync(filepath, jws);
          }
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
        $comment: 'Offline verification bundle with sample records and JWKS',
        description: 'Sample record metadata and the sandbox public verification keys.',
        generated_at: new Date(generationNow * 1000).toISOString(),
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
          'Valid samples are issued through issue() and pass local verification (verifyLocal).',
          'Invalid samples are intentionally invalid rejection fixtures.',
          'For valid samples, --now sets the event time (occurred_at); iat is issuance time.',
          'Sandbox samples are for local testing and demonstration; do NOT use them in production.',
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
              generation_time: generationNow,
              event_time: eventTime ?? null,
              kid,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Sample records generated successfully!\n`);
        console.log(`Output directory: ${outputDir}`);
        console.log(`Files generated: ${generatedFiles.length}`);
        console.log(
          `Generation time: ${generationNow} (${new Date(generationNow * 1000).toISOString()})`
        );
        if (eventTime !== undefined) {
          console.log(`Event time: ${eventTime} (${new Date(eventTime * 1000).toISOString()})`);
        }
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
