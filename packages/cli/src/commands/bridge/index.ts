/**
 * Bridge management commands: install|start|stop|status
 */

import { Command } from 'commander';
import { installCommand } from './install';
import { startCommand } from './start';
import { stopCommand } from './stop';
import { statusCommand } from './status';

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
