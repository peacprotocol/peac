/**
 * Node.js server entry point
 *
 * Binds the portable Hono app to @hono/node-server on port 3100.
 * For Cloudflare Workers, export { app } from './app.js' instead.
 */

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = parseInt(process.env.PORT ?? '3100', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Sandbox issuer listening on http://127.0.0.1:${port}`);
});
