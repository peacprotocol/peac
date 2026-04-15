#!/usr/bin/env node
// GitHub Copilot MCP registry compatibility checker.
//
// Validates that an MCP server endpoint meets the documented
// requirements for the GitHub Copilot enterprise custom MCP registry
// (public preview at time of writing; treat as supported-but-evolving).
// Inspects the server's MCP initialize response, CORS preflight
// headers, and tool list against the current published compatibility
// requirements. Submits nothing to GitHub.
//
// Usage:
//   node scripts/check-copilot-compatibility.mjs [--base-url URL]
//
// Defaults to http://localhost:8787 so this script runs in the
// standard mcp-server local dev loop without configuration. Use
// --base-url to point at a non-default deployment.
//
// Exit codes:
//   0 = all checks passed
//   1 = one or more compatibility checks failed
//   2 = unreachable endpoint (configuration error)

import { argv } from 'node:process';

function parseArgs() {
  const args = { baseUrl: 'http://localhost:8787' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--base-url' && i + 1 < argv.length) {
      args.baseUrl = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

async function fetchHTTP(url, init) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text };
  } catch (err) {
    return { error: err };
  }
}

async function main() {
  const { baseUrl } = parseArgs();
  console.log(`Checking Copilot MCP compatibility at ${baseUrl}`);

  const init = await fetchHTTP(baseUrl + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'copilot-compat-check', version: '1.0' },
      },
    }),
  });
  if (init.error) {
    console.error(`ERROR: endpoint unreachable: ${init.error.message}`);
    process.exit(2);
  }
  if (init.status !== 200) {
    fail(`initialize returned status ${init.status} (expected 200)`);
  } else {
    pass('initialize returned 200');
  }

  let initPayload = null;
  try {
    initPayload = JSON.parse(init.body);
  } catch (err) {
    fail(`initialize response is not valid JSON: ${err.message}`);
  }
  if (initPayload && initPayload.result) {
    const protoVer = initPayload.result.protocolVersion;
    if (typeof protoVer !== 'string' || protoVer.length === 0) {
      fail('initialize result missing protocolVersion');
    } else {
      pass(`initialize advertises protocolVersion=${protoVer}`);
    }
  }

  const preflight = await fetchHTTP(baseUrl + '/mcp', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://github.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  if (preflight.error) {
    fail(`OPTIONS preflight unreachable: ${preflight.error.message}`);
  } else {
    const allowOrigin = preflight.headers.get('access-control-allow-origin');
    const allowMethods = preflight.headers.get('access-control-allow-methods');
    if (!allowOrigin) {
      fail('OPTIONS response missing Access-Control-Allow-Origin');
    } else if (allowOrigin !== '*' && allowOrigin !== 'https://github.com') {
      fail(
        `Access-Control-Allow-Origin = ${allowOrigin}; must be "*" or an allow-listed GitHub origin`
      );
    } else {
      pass(`CORS Access-Control-Allow-Origin: ${allowOrigin}`);
    }
    if (!allowMethods || !allowMethods.toUpperCase().includes('POST')) {
      fail(`Access-Control-Allow-Methods must include POST, got ${allowMethods}`);
    } else {
      pass('CORS Access-Control-Allow-Methods includes POST');
    }
  }

  const toolsList = await fetchHTTP(baseUrl + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  if (toolsList.error) {
    fail(`tools/list unreachable: ${toolsList.error.message}`);
  } else {
    try {
      const body = JSON.parse(toolsList.body);
      const tools = body?.result?.tools;
      if (!Array.isArray(tools) || tools.length === 0) {
        fail('tools/list did not return a non-empty tools array');
      } else {
        pass(`tools/list returned ${tools.length} tool(s)`);
      }
      const firstTool = tools?.[0];
      if (firstTool && firstTool._meta) {
        const keys = Object.keys(firstTool._meta);
        const peacKeys = keys.filter((k) => k.startsWith('org.peacprotocol/'));
        if (peacKeys.length > 0) {
          pass(`tool _meta carries PEAC-namespaced keys: ${peacKeys.join(', ')}`);
        }
      }
    } catch (err) {
      fail(`tools/list response is not valid JSON: ${err.message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} Copilot-compatibility failure(s).`);
    process.exit(1);
  }
  console.log('\nAll Copilot-compatibility checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
