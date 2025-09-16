/**
 * peac bridge start - Start the bridge server
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, accessSync, openSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function startCommand() {
  return new Command('start')
    .description('Start the PEAC Bridge')
    .option('--port <port>', 'Port to listen on', '31415')
    .option('--mode <mode>', 'Mode (dev|test|production)', 'production')
    .option('--foreground', 'Run in foreground mode')
    .action(async (options) => {
      const peacDir = join(homedir(), '.peac');
      const logsDir = join(peacDir, 'logs');
      const pidFile = join(peacDir, 'bridge.pid');

      // Ensure directories exist
      mkdirSync(peacDir, { recursive: true });
      mkdirSync(logsDir, { recursive: true });

      const env = {
        ...process.env,
        PEAC_BRIDGE_PORT: options.port,
        PEAC_MODE: options.mode,
      };

      // Use discovery system to find bridge executable
      let bridgePath = null;

      // Find bridge executable using manual discovery
      const bridgePaths = [
        // Local development (monorepo)
        join(process.cwd(), 'apps/bridge/dist/server.js'),
        // Try to resolve installed module path
        (() => {
          try {
            return require.resolve('@peac/app-bridge/dist/server.js');
          } catch {
            return null;
          }
        })(),
      ].filter(Boolean) as string[];

      for (const path of bridgePaths) {
        try {
          accessSync(path);
          bridgePath = path;
          break;
        } catch {
          continue;
        }
      }

      if (!bridgePath) {
        console.error('❌ Bridge executable not found');
        console.error('   Run "pnpm build" in monorepo or install @peac/app-bridge');
        process.exit(1);
      }

      if (options.foreground) {
        // Run in foreground
        const args = ['node', bridgePath];
        const bridge = spawn(args[0], args.slice(1), {
          stdio: 'inherit',
          env,
        });

        console.log(`🌉 Starting PEAC Bridge on port ${options.port}`);
        console.log('🔗 Press Ctrl+C to stop');

        bridge.on('error', (err) => {
          console.error('❌ Failed to start bridge:', err);
          process.exit(1);
        });

        bridge.on('exit', (code) => {
          console.log(`Bridge exited with code ${code}`);
          process.exit(code || 0);
        });
      } else {
        // Run in background
        const logFile = join(logsDir, 'bridge.log');
        const out = openSync(logFile, 'a');
        const err = openSync(logFile, 'a');

        const args = ['node', bridgePath];
        const bridge = spawn(args[0], args.slice(1), {
          detached: true,
          stdio: ['ignore', out, err],
          env,
        });

        bridge.unref();

        // Write PID file
        writeFileSync(pidFile, bridge.pid?.toString() || '');

        console.log(`🌉 Bridge started on port ${options.port} (PID: ${bridge.pid})`);
        console.log(`📋 Logs: ${logFile}`);

        // Write/update config
        const configFile = join(peacDir, 'bridge.json');
        try {
          const existingConfig = JSON.parse(readFileSync(configFile, 'utf-8'));
          existingConfig.pid = bridge.pid;
          existingConfig.started_at = new Date().toISOString();
          existingConfig.log_file = logFile;
          writeFileSync(configFile, JSON.stringify(existingConfig, null, 2));
        } catch {
          // Create new config if it doesn't exist
          writeFileSync(
            configFile,
            JSON.stringify(
              {
                url: `http://127.0.0.1:${options.port}`,
                version: '0.9.13.2',
                wire_version: '0.9.13',
                pid: bridge.pid,
                started_at: new Date().toISOString(),
                log_file: logFile,
              },
              null,
              2
            )
          );
        }

        // Wait a moment and check if it started successfully
        setTimeout(async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${options.port}/health`);
            if (response.ok) {
              console.log(`✅ Bridge is healthy and responding`);
            } else {
              console.warn(`⚠️  Bridge responding but not healthy (HTTP ${response.status})`);
            }
          } catch (error) {
            console.warn(
              `⚠️  Bridge may not be responding yet:`,
              error instanceof Error ? error.message : String(error)
            );
            console.log(`   Check logs: ${logFile}`);
          }
        }, 2000);
      }
    });
}
