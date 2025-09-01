import { Command, Option } from 'clipanion';
import { readFileSync, existsSync } from 'fs';
import chalk from 'chalk';

interface ReceiptClaims {
  iss?: string;
  sub?: string;
  iat?: number;
  jti?: string;
  tier?: string;
  req?: {
    m?: string;
    p?: string;
  };
  ph?: string;
  attr?: string;
  wba?: string;
  [key: string]: any;
}

export class ReceiptShowCommand extends Command {
  static paths = [['receipt', 'show']];

  static usage = Command.Usage({
    description: 'Decode and display PEAC receipt claims',
    details: 'Parse JWS receipt and display claims with optional field redaction',
    examples: [
      ['Show receipt claims', 'peac receipt show receipt.jws'],
      ['Show without redaction', 'peac receipt show receipt.jws --no-redact'],
      ['Show inline JWS', 'peac receipt show "eyJ0eXAi..."'],
    ],
  });

  receipt = Option.String({ required: true });
  redact = Option.Boolean('--redact', true, {
    description: 'Redact sensitive fields (default: true)',
  });

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
        this.context.stderr.write(chalk.red('Invalid JWS format\n'));
        return 2;
      }

      // Parse header
      let header: any;
      try {
        const headerBytes = Buffer.from(parts[0]!, 'base64url');
        header = JSON.parse(headerBytes.toString('utf-8'));
      } catch (error) {
        this.context.stderr.write(chalk.red('Invalid JWS header\n'));
        return 2;
      }

      // Parse payload
      let claims: ReceiptClaims;
      try {
        const payloadBytes = Buffer.from(parts[1]!, 'base64url');
        claims = JSON.parse(payloadBytes.toString('utf-8'));
      } catch (error) {
        this.context.stderr.write(chalk.red('Invalid JWS payload\n'));
        return 2;
      }

      // Display header
      this.context.stdout.write(chalk.bold('Header:\n'));
      this.context.stdout.write(`  Algorithm: ${header.alg || 'unknown'}\n`);
      this.context.stdout.write(`  Type: ${header.typ || 'unknown'}\n`);
      this.context.stdout.write(`  Kid: ${header.kid || 'missing'}\n`);

      // Display claims
      this.context.stdout.write(chalk.bold('\nClaims:\n'));

      if (claims.iss) {
        this.context.stdout.write(`  Issuer: ${claims.iss}\n`);
      }

      if (claims.sub) {
        this.context.stdout.write(`  Subject: ${claims.sub}\n`);
      }

      if (claims.iat) {
        const date = new Date(claims.iat * 1000);
        this.context.stdout.write(`  Issued At: ${date.toISOString()} (${claims.iat})\n`);

        // Calculate age
        const now = Math.floor(Date.now() / 1000);
        const ageHours = Math.floor((now - claims.iat) / 3600);
        if (ageHours < 24) {
          this.context.stdout.write(`  Age: ${ageHours} hours\n`);
        } else {
          const ageDays = Math.floor(ageHours / 24);
          this.context.stdout.write(`  Age: ${ageDays} days\n`);
        }
      }

      if (claims.jti) {
        if (this.redact) {
          const redacted = claims.jti.substring(0, 8) + '...';
          this.context.stdout.write(`  JTI: ${redacted}\n`);
        } else {
          this.context.stdout.write(`  JTI: ${claims.jti}\n`);
        }
      }

      if (claims.tier) {
        const color =
          claims.tier === 'verified'
            ? chalk.green
            : claims.tier === 'attributed'
              ? chalk.yellow
              : chalk.gray;
        this.context.stdout.write(`  Tier: ${color(claims.tier)}\n`);
      }

      if (claims.req) {
        this.context.stdout.write(`  Request:\n`);
        if (claims.req.m) {
          const method = this.expandMethod(claims.req.m);
          this.context.stdout.write(`    Method: ${method}\n`);
        }
        if (claims.req.p) {
          if (this.redact) {
            this.context.stdout.write(`    Path Hash: ${claims.req.p.substring(0, 16)}...\n`);
          } else {
            this.context.stdout.write(`    Path Hash: ${claims.req.p}\n`);
          }
        }
      }

      if (claims.ph) {
        if (this.redact) {
          this.context.stdout.write(`  Policy Hash: ${claims.ph.substring(0, 16)}...\n`);
        } else {
          this.context.stdout.write(`  Policy Hash: ${claims.ph}\n`);
        }
      }

      if (claims.attr) {
        this.context.stdout.write(`  Attribution: ${claims.attr}\n`);
      }

      if (claims.wba) {
        if (this.redact) {
          this.context.stdout.write(`  WBA Thumbprint: ${claims.wba.substring(0, 16)}...\n`);
        } else {
          this.context.stdout.write(`  WBA Thumbprint: ${claims.wba}\n`);
        }
      }

      // Show any other claims
      const knownFields = new Set(['iss', 'sub', 'iat', 'jti', 'tier', 'req', 'ph', 'attr', 'wba']);
      const otherClaims = Object.entries(claims).filter(([key]) => !knownFields.has(key));

      if (otherClaims.length > 0) {
        this.context.stdout.write(chalk.bold('\nOther Claims:\n'));
        for (const [key, value] of otherClaims) {
          this.context.stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);
        }
      }

      // Validation warnings
      this.context.stdout.write(chalk.bold('\nValidation:\n'));

      if (!claims.iat) {
        this.context.stdout.write(chalk.yellow('  ⚠ Missing issued at timestamp\n'));
      } else {
        const now = Math.floor(Date.now() / 1000);

        if (claims.iat > now + 60) {
          this.context.stdout.write(chalk.red('  ✗ Issued in future\n'));
        } else if (claims.iat < now - 30 * 24 * 3600) {
          this.context.stdout.write(chalk.red('  ✗ Expired (>30 days old)\n'));
        } else {
          this.context.stdout.write(chalk.green('  ✓ Timestamp valid\n'));
        }
      }

      if (!header.kid) {
        this.context.stdout.write(chalk.yellow('  ⚠ Missing key identifier\n'));
      }

      if (header.alg !== 'EdDSA') {
        this.context.stdout.write(chalk.yellow(`  ⚠ Unexpected algorithm: ${header.alg}\n`));
      }

      return 0;
    } catch (error) {
      this.context.stderr.write(chalk.red(`Error: ${error}\n`));
      return 3;
    }
  }

  private expandMethod(methodInitial: string): string {
    switch (methodInitial) {
      case 'G':
        return 'GET';
      case 'P':
        return 'POST';
      case 'H':
        return 'HEAD';
      case 'D':
        return 'DELETE';
      case 'O':
        return 'OPTIONS';
      case 'T':
        return 'TRACE';
      case 'C':
        return 'CONNECT';
      default:
        return methodInitial;
    }
  }
}
