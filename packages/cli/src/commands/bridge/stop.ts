/**
 * peac bridge stop - Stop the bridge server
 */

import { Command } from 'commander';
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function stopCommand() {
  return new Command('stop').description('Stop the PEAC Bridge').action(async () => {
    const peacDir = join(homedir(), '.peac');
    const pidFile = join(peacDir, 'bridge.pid');
    const configFile = join(peacDir, 'bridge.json');

    // Check if PID file exists
    if (!existsSync(pidFile)) {
      console.log('🌉 Bridge is not running (no PID file found)');
      return;
    }

    try {
      // Read PID from file
      const pidStr = readFileSync(pidFile, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid)) {
        console.error('❌ Invalid PID in bridge.pid file');
        unlinkSync(pidFile);
        return;
      }

      // Check if process is running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
      } catch (error: any) {
        if (error.code === 'ESRCH') {
          console.log('🌉 Bridge process not found (cleaning up stale PID file)');
          unlinkSync(pidFile);
          return;
        }
        throw error;
      }

      // Stop the bridge process
      console.log(`🛑 Stopping PEAC Bridge (PID: ${pid})`);

      try {
        // Try graceful shutdown first (SIGTERM)
        process.kill(pid, 'SIGTERM');

        // Wait a moment for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if still running
        try {
          process.kill(pid, 0);
          // Still running, force kill
          console.log('⚡ Force stopping bridge process...');
          process.kill(pid, 'SIGKILL');
        } catch (error: any) {
          if (error.code === 'ESRCH') {
            // Process stopped gracefully
            console.log('✅ Bridge stopped successfully');
          }
        }
      } catch (error: any) {
        if (error.code === 'ESRCH') {
          console.log('✅ Bridge stopped successfully');
        } else {
          console.error('❌ Failed to stop bridge:', error.message);
          return;
        }
      }

      // Clean up PID file
      unlinkSync(pidFile);

      // Update config file
      if (existsSync(configFile)) {
        try {
          const config = JSON.parse(readFileSync(configFile, 'utf-8'));
          delete config.pid;
          delete config.started_at;
          delete config.log_file;
          config.stopped_at = new Date().toISOString();

          writeFileSync(configFile, JSON.stringify(config, null, 2));
        } catch (error) {
          // Config update failed, but bridge was stopped
          console.warn('⚠️  Failed to update config file, but bridge was stopped');
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to stop bridge:', error.message);

      // Clean up potentially stale PID file
      if (existsSync(pidFile)) {
        unlinkSync(pidFile);
      }
    }
  });
}
