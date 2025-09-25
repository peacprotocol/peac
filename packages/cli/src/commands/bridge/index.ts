/**
 * Bridge management commands: install|start|stop|status
 */

import { Command } from 'commander';
import { installCommand } from './install.js';
import { startCommand } from './start.js';
import { stopCommand } from './stop.js';
import { statusCommand } from './status.js';

export function bridgeCommand() {
  const bridge = new Command('bridge').description(
    'Manage PEAC Protocol Bridge (local development sidecar)'
  );

  bridge.addCommand(installCommand());
  bridge.addCommand(startCommand());
  bridge.addCommand(stopCommand());
  bridge.addCommand(statusCommand());

  return bridge;
}
