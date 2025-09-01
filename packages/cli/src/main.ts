#!/usr/bin/env node

import { Cli } from 'clipanion';
import { VerifyReceiptCommand } from './cmd/verify-receipt.js';
import { DirGetCommand } from './cmd/dir-get.js';
import { PolicyLintCommand } from './cmd/policy-lint.js';
import { ReceiptShowCommand } from './cmd/receipt-show.js';

const cli = new Cli({
  binaryLabel: 'PEAC Protocol CLI',
  binaryName: 'peac',
  binaryVersion: '0.9.11'
});

cli.register(VerifyReceiptCommand);
cli.register(DirGetCommand);
cli.register(PolicyLintCommand);
cli.register(ReceiptShowCommand);

cli.runExit();