/**
 * peac bridge stop - Stop the bridge server
 */

import { Command } from 'commander';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import {
  readFileUtf8Snapshot,
  rewriteJsonFileAtomic,
  unlinkIfExists,
} from '../../lib/safe-file.js';

// Windows-safe process termination
async function killProcess(pid: number, signal?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      // Use taskkill on Windows
      const force = signal === 'SIGKILL' ? '/F' : '';
      const taskkill = spawn('taskkill', ['/PID', pid.toString(), force].filter(Boolean));

      taskkill.on('exit', (code) => {
        if (code === 0 || code === 128) {
          // 128 = process not found
          resolve();
        } else {
          reject(new Error(`taskkill failed with code ${code}`));
        }
      });

      taskkill.on('error', reject);
    } else {
      // Use standard signals on Unix-like systems
      try {
        process.kill(pid, signal || 'SIGTERM');
        resolve();
      } catch (error) {
        reject(error);
      }
    }
  });
}

export function stopCommand() {
  return new Command('stop').description('Stop the PEAC Bridge').action(async () => {
    const peacDir = join(homedir(), '.peac');
    const pidFile = join(peacDir, 'bridge.pid');
    const configFile = join(peacDir, 'bridge.json');

    // Read PID from file via fd-bound snapshot. Errno discrimination is the
    // single source of truth for the missing-file path: ENOENT means the
    // bridge is not running.
    let pidStr: string;
    try {
      pidStr = readFileUtf8Snapshot(pidFile).trim();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('Bridge is not running (no PID file found)');
        return;
      }
      console.error('Failed to stop bridge:', (err as Error).message);
      return;
    }

    try {
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid)) {
        console.error('Invalid PID in bridge.pid file');
        unlinkIfExists(pidFile);
        return;
      }

      // Check if process is running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
      } catch (error: any) {
        if (error.code === 'ESRCH') {
          console.log('Bridge process not found (cleaning up stale PID file)');
          unlinkIfExists(pidFile);
          return;
        }
        throw error;
      }

      // Stop the bridge process
      console.log(`Stopping PEAC Bridge (PID: ${pid})`);

      try {
        // Try graceful shutdown first (SIGTERM)
        await killProcess(pid, 'SIGTERM');

        // Wait a moment for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if still running
        try {
          process.kill(pid, 0);
          // Still running, force kill
          console.log('Force stopping bridge process...');
          await killProcess(pid, 'SIGKILL');
        } catch (error: any) {
          if (error.code === 'ESRCH') {
            // Process stopped gracefully
            console.log('Bridge stopped successfully');
          }
        }
      } catch (error: any) {
        if (error.code === 'ESRCH') {
          console.log('Bridge stopped successfully');
        } else {
          console.error('Failed to stop bridge:', error.message);
          return;
        }
      }

      // Clean up PID file (ENOENT-tolerant)
      unlinkIfExists(pidFile);

      // Update config file via atomic temp+rename. Returns silently if the
      // config file does not exist; partial writes cannot corrupt the existing
      // config because rename(2) is atomic on the same filesystem.
      try {
        rewriteJsonFileAtomic(configFile, (config) => {
          delete config.pid;
          delete config.started_at;
          delete config.log_file;
          config.stopped_at = new Date().toISOString();
        });
      } catch {
        // Config update failed, but bridge was stopped
        console.warn('Failed to update config file, but bridge was stopped');
      }
    } catch (error: any) {
      console.error('Failed to stop bridge:', error.message);

      // Clean up potentially stale PID file (ENOENT-tolerant)
      unlinkIfExists(pidFile);
    }
  });
}
