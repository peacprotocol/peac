// Direct globalThis.fetch access: must be caught by AST audit.
export async function getData(url: string) {
  const response = globalThis.fetch(url);
  return response;
}
