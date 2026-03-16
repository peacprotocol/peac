// CommonJS require of forbidden module: must be caught by AST audit.
const http = require('http');
export const server = http.createServer();
