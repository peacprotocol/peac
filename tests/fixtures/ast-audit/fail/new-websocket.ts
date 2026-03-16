// WebSocket constructor: must be caught by AST audit.
export function connect(url: string) {
  return new WebSocket(url);
}
