import { Command, Option } from 'clipanion';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import * as ed25519 from '@noble/ed25519';

interface JsonWebKey {
  kty: string;
  crv?: string;
  x?: string;
  kid?: string;
}

export class VerifyReceiptCommand extends Command {
  static paths = [['verify', 'receipt']];

  static usage = Command.Usage({
    description: 'Verify a PEAC receipt signature',
    details:
      'Verify JWS receipt using provided keys. Exit codes: 0=success, 1=verify fail, 2=invalid input, 3=IO error',
    examples: [
      ['Verify receipt from file', 'peac verify receipt receipt.jws --keys jwks.json'],
      ['Verify inline receipt', 'peac verify receipt "eyJ0eXAi..." --keys jwks.json'],
      ['JSON output', 'peac verify receipt receipt.jws --keys jwks.json --out json'],
    ],
  });

  receipt = Option.String({ required: true });
  keys = Option.String('--keys', { description: 'Path to JWKS JSON file' });
  out = Option.String('--out', 'text', { description: 'Output format: text|json' });

  async execute(): Promise<number> {
    try {
      // Read receipt (file or direct JWS)
      let jws: string;
      if (existsSync(this.receipt)) {
        try {
          jws = readFileSync(this.receipt, 'utf-8').trim();
        } catch (error) {
          this.context.stderr.write(chalk.red('Error reading receipt file\n'));
          return 3;
        }
      } else {
        jws = this.receipt;
      }

      // Validate JWS format
      const parts = jws.split('.');
      if (parts.length !== 3) {
        if (this.out === 'json') {
          this.context.stdout.write(
            JSON.stringify({ ok: false, error: 'invalid_jws_format' }) + '\n',
          );
        } else {
          this.context.stderr.write(chalk.red('Invalid JWS format\n'));
        }
        return 2;
      }

      // Parse header
      let header: any;
      try {
        const headerBytes = Buffer.from(parts[0]!, 'base64url');
        header = JSON.parse(headerBytes.toString('utf-8'));
      } catch (error) {
        if (this.out === 'json') {
          this.context.stdout.write(JSON.stringify({ ok: false, error: 'invalid_header' }) + '\n');
        } else {
          this.context.stderr.write(chalk.red('Invalid JWS header\n'));
        }
        return 2;
      }

      // Check algorithm
      if (header.alg !== 'EdDSA') {
        if (this.out === 'json') {
          this.context.stdout.write(
            JSON.stringify({ ok: false, error: 'unsupported_algorithm' }) + '\n',
          );
        } else {
          this.context.stderr.write(chalk.red(`Unsupported algorithm: ${header.alg}\n`));
        }
        return 2;
      }

      // If keys provided, verify signature
      if (this.keys) {
        if (!existsSync(this.keys)) {
          if (this.out === 'json') {
            this.context.stdout.write(
              JSON.stringify({ ok: false, error: 'keys_file_not_found' }) + '\n',
            );
          } else {
            this.context.stderr.write(chalk.red('Keys file not found\n'));
          }
          return 3;
        }

        let jwks: { keys: JsonWebKey[] };
        try {
          const keysData = readFileSync(this.keys, 'utf-8');
          jwks = JSON.parse(keysData);
        } catch (error) {
          if (this.out === 'json') {
            this.context.stdout.write(
              JSON.stringify({ ok: false, error: 'invalid_keys_file' }) + '\n',
            );
          } else {
            this.context.stderr.write(chalk.red('Invalid keys file\n'));
          }
          return 3;
        }

        if (!header.kid) {
          if (this.out === 'json') {
            this.context.stdout.write(JSON.stringify({ ok: false, error: 'missing_kid' }) + '\n');
          } else {
            this.context.stderr.write(chalk.red('Missing kid in header\n'));
          }
          return 2;
        }

        // Find key
        const key = jwks.keys.find((k) => k.kid === header.kid);
        if (!key) {
          if (this.out === 'json') {
            this.context.stdout.write(JSON.stringify({ ok: false, error: 'key_not_found' }) + '\n');
          } else {
            this.context.stderr.write(chalk.red(`Key not found: ${header.kid}\n`));
          }
          return 1;
        }

        if (key.kty !== 'OKP' || key.crv !== 'Ed25519' || !key.x) {
          if (this.out === 'json') {
            this.context.stdout.write(
              JSON.stringify({ ok: false, error: 'invalid_key_type' }) + '\n',
            );
          } else {
            this.context.stderr.write(chalk.red('Invalid key type (must be Ed25519)\n'));
          }
          return 2;
        }

        // Verify signature
        try {
          const publicKeyBytes = Buffer.from(key.x, 'base64url');
          const signatureData = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf-8');
          const signatureBytes = Buffer.from(parts[2]!, 'base64url');

          const isValid = await ed25519.verify(signatureBytes, signatureData, publicKeyBytes);

          if (!isValid) {
            if (this.out === 'json') {
              this.context.stdout.write(
                JSON.stringify({ ok: false, error: 'signature_invalid' }) + '\n',
              );
            } else {
              this.context.stderr.write(chalk.red('Signature verification failed\n'));
            }
            return 1;
          }

          // Parse claims for additional validation
          const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
          const now = Math.floor(Date.now() / 1000);

          // Check if issued in future
          if (payload.iat && payload.iat > now + 60) {
            if (this.out === 'json') {
              this.context.stdout.write(
                JSON.stringify({ ok: false, error: 'issued_in_future' }) + '\n',
              );
            } else {
              this.context.stderr.write(chalk.red('Receipt issued in future\n'));
            }
            return 1;
          }

          // Check expiry (30 days)
          if (payload.iat && payload.iat < now - 30 * 24 * 3600) {
            if (this.out === 'json') {
              this.context.stdout.write(JSON.stringify({ ok: false, error: 'expired' }) + '\n');
            } else {
              this.context.stderr.write(chalk.red('Receipt expired\n'));
            }
            return 1;
          }

          if (this.out === 'json') {
            this.context.stdout.write(
              JSON.stringify({
                ok: true,
                kid: header.kid,
                claims: payload,
              }) + '\n',
            );
          } else {
            this.context.stdout.write(chalk.green('✓ Receipt signature valid\n'));
            this.context.stdout.write(`Kid: ${header.kid}\n`);
            this.context.stdout.write(`Issued: ${new Date(payload.iat * 1000).toISOString()}\n`);
          }
        } catch (error) {
          if (this.out === 'json') {
            this.context.stdout.write(
              JSON.stringify({ ok: false, error: 'verification_error' }) + '\n',
            );
          } else {
            this.context.stderr.write(chalk.red(`Verification error: ${error}\n`));
          }
          return 1;
        }
      } else {
        // No verification, just parse and show structure
        const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));

        if (this.out === 'json') {
          this.context.stdout.write(
            JSON.stringify({
              ok: true,
              verified: false,
              kid: header.kid,
              claims: payload,
            }) + '\n',
          );
        } else {
          this.context.stdout.write(chalk.yellow('⚠ No keys provided - signature not verified\n'));
          this.context.stdout.write(`Kid: ${header.kid || 'missing'}\n`);
          if (payload.iat) {
            this.context.stdout.write(`Issued: ${new Date(payload.iat * 1000).toISOString()}\n`);
          }
        }
      }

      return 0;
    } catch (error) {
      if (this.out === 'json') {
        this.context.stdout.write(JSON.stringify({ ok: false, error: String(error) }) + '\n');
      } else {
        this.context.stderr.write(chalk.red(`Error: ${error}\n`));
      }
      return 3;
    }
  }
}
