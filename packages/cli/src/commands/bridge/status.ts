/**
 * peac bridge status - Check bridge server status
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function statusCommand() {
  return new Command('status')
    .description('Check PEAC Bridge status')
    .option('--json', 'Output status as JSON')
    .action(async (options) => {
      const peacDir = join(homedir(), '.peac');
      const pidFile = join(peacDir, 'bridge.pid');
      const configFile = join(peacDir, 'bridge.json');

      const status: any = {
        running: false,
        configured: existsSync(configFile),
        config: null,
        process: null,
        health: null,
      };

      // Check configuration
      if (status.configured) {
        try {
          status.config = JSON.parse(readFileSync(configFile, 'utf-8'));
        } catch (error) {
          status.config = { error: 'Invalid config file' };
        }
      }

      // Check if process is running
      if (existsSync(pidFile)) {
        try {
          const pidStr = readFileSync(pidFile, 'utf-8').trim();
          const pid = parseInt(pidStr, 10);

          if (!isNaN(pid)) {
            try {
              process.kill(pid, 0); // Signal 0 checks if process exists
              status.running = true;
              status.process = {
                pid,
                uptime: status.config?.started_at
                  ? Math.round((Date.now() - new Date(status.config.started_at).getTime()) / 1000)
                  : null,
              };

              // Try to check health endpoint
              if (status.config?.url) {
                try {
                  const healthUrl = status.config.url.replace(/\/$/, '') + '/health';
                  const response = await fetch(healthUrl, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(5000),
                  });

                  if (response.ok) {
                    status.health = await response.json();
                    status.health.status = 'healthy';
                    // Capture peac-version header if present
                    const peacVersion = response.headers.get('peac-version');
                    if (peacVersion) {
                      status.health.peac_version = peacVersion;
                    }
                  } else {
                    status.health = {
                      status: 'unhealthy',
                      code: response.status,
                      statusText: response.statusText,
                    };
                  }
                } catch (error: any) {
                  status.health = {
                    status: 'unreachable',
                    error: error.message,
                  };
                }
              }
            } catch (error: any) {
              if (error.code === 'ESRCH') {
                status.process = { pid, status: 'not_found' };
              } else {
                status.process = { pid, error: error.message };
              }
            }
          }
        } catch (error) {
          status.process = { error: 'Invalid PID file' };
        }
      }

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      // Human-readable output
      console.log('PEAC Bridge Status');
      console.log('');

      if (!status.configured) {
        console.log('Configuration: Not configured');
        console.log('   Run "peac bridge install" to initialize');
        return;
      }

      console.log('Configuration: Found');
      if (status.config?.url) {
        console.log(`   URL: ${status.config.url}`);
      }
      if (status.config?.wire_version) {
        console.log(`   Wire version: ${status.config.wire_version}`);
      }
      if (status.config?.version) {
        console.log(`   Implementation version: ${status.config.version}`);
      }

      console.log('');

      if (!status.running) {
        console.log('Process: Not running');
        if (status.process?.status === 'not_found') {
          console.log('   (Stale PID file - process not found)');
        }
        console.log('   Run "peac bridge start" to start the bridge');
        return;
      }

      console.log('Process: Running');
      console.log(`   PID: ${status.process.pid}`);
      if (status.process.uptime !== null) {
        const uptime = status.process.uptime;
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        console.log(`   Uptime: ${hours}h ${minutes}m ${seconds}s`);
      }
      if (status.config?.log_file) {
        console.log(`   Logs: ${status.config.log_file}`);
      }

      console.log('');

      if (!status.health) {
        console.log('Health: Unknown (no URL configured)');
      } else if (status.health.status === 'healthy') {
        console.log('Health: Healthy');
        if (status.health.peac_version) {
          console.log(`   Wire version: ${status.health.peac_version}`);
        }
        if (status.health.response_time_ms) {
          console.log(`   Response time: ${status.health.response_time_ms.toFixed(2)}ms`);
        }
        if (status.health.memory_mb) {
          console.log(`   Memory usage: ${status.health.memory_mb.toFixed(1)} MB`);
        }
      } else if (status.health.status === 'unhealthy') {
        console.log('Health: Unhealthy');
        console.log(`   HTTP ${status.health.code}: ${status.health.statusText}`);
      } else if (status.health.status === 'unreachable') {
        console.log('Health: Unreachable');
        console.log(`   Error: ${status.health.error}`);
        console.log('   Bridge may be starting up or misconfigured');
      }

      // Show readiness if we have health info
      if (status.health?.status === 'healthy' && status.config?.url) {
        try {
          const readyUrl = status.config.url.replace(/\/$/, '') + '/ready';
          const response = await fetch(readyUrl, {
            method: 'GET',
            headers: { Accept: 'application/peac+json' },
            signal: AbortSignal.timeout(5000),
          });

          if (response.ok) {
            const readiness = (await response.json()) as {
              ok?: boolean;
              checks?: Record<string, boolean>;
            };
            console.log('');
            console.log('Readiness:', readiness.ok ? 'Ready' : 'Not Ready');
            if (readiness.checks) {
              Object.entries(readiness.checks).forEach(([check, result]) => {
                console.log(`   ${check}: ${result ? 'OK' : 'FAIL'}`);
              });
            }
          }
        } catch (error) {
          // Readiness check failed, but don't show error - health already covers connectivity
        }
      }
    });
}
