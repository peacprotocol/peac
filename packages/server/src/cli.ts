#!/usr/bin/env node
/**
 * PEAC verification server CLI
 */

import { serve } from '@hono/node-server';
import { app } from './server';

const port = Number(process.env.PORT) || 3000;

console.log(`PEAC verification server starting on port ${port}`);
console.log(`Endpoints:`);
console.log(`   POST http://localhost:${port}/verify`);
console.log(`   GET  http://localhost:${port}/.well-known/peac.txt`);
console.log(`   GET  http://localhost:${port}/slo`);
console.log(`   GET  http://localhost:${port}/health`);

serve({
  fetch: app.fetch,
  port,
});
