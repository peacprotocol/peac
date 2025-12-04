/**
 * peac bridge install - Initialize bridge configuration
 */

import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function installCommand() {
  return new Command('install').description('Initialize bridge configuration').action(() => {
    const peacDir = join(homedir(), '.peac');
    mkdirSync(peacDir, { recursive: true });

    const config = {
      url: 'http://127.0.0.1:31415',
      version: '0.9.13.2', // Implementation version
      wire_version: '0.9.13', // Wire protocol version
      created_at: new Date().toISOString(),
    };

    writeFileSync(join(peacDir, 'bridge.json'), JSON.stringify(config, null, 2));

    console.log('Initialized ~/.peac/bridge.json');
    console.log(`   Wire version: ${config.wire_version}`);
    console.log(`   Bridge URL: ${config.url}`);
  });
}
