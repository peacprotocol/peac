import { Adapter } from './types.js';

const adapters = new Map<string, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  if (adapters.has(adapter.kind)) {
    throw new Error(`Adapter for '${adapter.kind}' is already registered`);
  }
  
  adapters.set(adapter.kind, adapter);
}

export function getAdapter(kind: string): Adapter | undefined {
  return adapters.get(kind);
}

export function listAdapters(): string[] {
  return Array.from(adapters.keys());
}

export function unregisterAdapter(kind: string): boolean {
  return adapters.delete(kind);
}

export function clearAdapters(): void {
  adapters.clear();
}