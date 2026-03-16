// Dynamic import of a forbidden module: must be caught by AST audit.
export async function loadHttp() {
  const https = await import('https');
  return https;
}
