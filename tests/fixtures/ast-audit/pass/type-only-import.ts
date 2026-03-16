// Type-only imports are erased at runtime: no network I/O path.
import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:https';

export type ServerRef = Server;
export type MessageRef = IncomingMessage;
