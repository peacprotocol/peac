export {
  registerAdapter,
  getAdapter,
  listAdapters,
  unregisterAdapter,
  clearAdapters,
} from './registry.js';
export { webBotAuthAdapter, WebBotAuthAdapter } from './web-bot-auth.js';
export type { Adapter, WebBotAuthContext, MCPContext, A2AContext, NandaContext } from './types.js';

// Auto-register the built-in Web Bot Auth adapter
import { registerAdapter } from './registry.js';
import { webBotAuthAdapter } from './web-bot-auth.js';

registerAdapter(webBotAuthAdapter);
