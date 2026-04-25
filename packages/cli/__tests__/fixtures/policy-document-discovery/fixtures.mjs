// Canonical parity-fixture data. Mirrored from fixtures.ts so the
// snapshot-capture script can consume it via dynamic import without an
// eval/new-Function transpile step. Keep in sync with fixtures.ts: each
// fixture entry MUST appear in both files. The TypeScript file is the
// source-of-truth for the test suite; this .mjs file is its data twin.

const VALID_YAML_MINIMAL = [
  "version: 'peac-policy/0.1'",
  'defaults:',
  "  decision: deny",
  'rules: []',
].join('\n');

const VALID_YAML_WITH_COMMENTS = [
  '# Top-of-file comment',
  "version: 'peac-policy/0.1'",
  '# Defaults section comment',
  'defaults:',
  '  decision: allow',
  '',
  'rules:',
  '  - name: rule-one',
  '    decision: allow',
  '',
].join('\n');

const VALID_JSON_MINIMAL = JSON.stringify({
  version: 'peac-policy/0.1',
  defaults: { decision: 'allow' },
  rules: [{ name: 'allow-everyone', decision: 'allow' }],
});

const LEGACY_VERIFY_LINE = `verify: https://api.example.com/verify\n${VALID_YAML_MINIMAL}\n`;
const LEGACY_PUBLIC_KEYS_LINE = `public_keys: ["key-1:EdDSA:abc"]\n${VALID_YAML_MINIMAL}\n`;
const LEGACY_JWKS_LINE = `jwks: https://example.com/.well-known/jwks.json\n${VALID_YAML_MINIMAL}\n`;
const LEGACY_MULTIPLE = [
  'verify: https://example.com/verify',
  'public_keys: ["k1:EdDSA:abc"]',
  'jwks: https://example.com/jwks.json',
  VALID_YAML_MINIMAL,
  '',
].join('\n');

const LEGACY_INSIDE_COMMENT = [
  '# verify: this is a comment, not a legacy line',
  VALID_YAML_MINIMAL,
  '',
].join('\n');

const LEGACY_INSIDE_BLOCK_SCALAR = [
  "version: 'peac-policy/0.1'",
  "name: 'has block scalar'",
  'defaults:',
  '  decision: deny',
  "  reason: |",
  '    Multiple lines',
  '    verify: not-a-legacy-key-here',
  '    More text',
  'rules: []',
  '',
].join('\n');

const INVALID_MALFORMED = ': :: not yaml ::: at all\n  - [unbalanced\n';
const INVALID_SCHEMA_VIOLATION = "version: 'peac-policy/0.9'\ndefaults:\n  decision: deny\nrules: []\n";
const EMPTY = '   \n   \n  ';

export const PARITY_FIXTURES = [
  { name: 'valid-minimal-yaml', text: VALID_YAML_MINIMAL + '\n', description: 'smallest valid YAML peac-policy/0.1' },
  { name: 'valid-with-comments', text: VALID_YAML_WITH_COMMENTS, description: 'valid YAML + comment lines + blank lines' },
  { name: 'valid-json-minimal', text: VALID_JSON_MINIMAL, description: 'valid JSON peac-policy/0.1 (auto-detect)' },
  { name: 'legacy-verify-line', text: LEGACY_VERIFY_LINE, description: 'top-level legacy verify: line stripped + warning' },
  { name: 'legacy-public-keys-line', text: LEGACY_PUBLIC_KEYS_LINE, description: 'top-level legacy public_keys: line stripped + warning' },
  { name: 'legacy-jwks-line', text: LEGACY_JWKS_LINE, description: 'top-level legacy jwks: line stripped + warning' },
  { name: 'legacy-multiple', text: LEGACY_MULTIPLE, description: 'multiple legacy lines stripped; one warning per line' },
  { name: 'legacy-inside-comment', text: LEGACY_INSIDE_COMMENT, description: 'verify-looking string inside a YAML comment is NOT a legacy line' },
  { name: 'legacy-inside-block-scalar', text: LEGACY_INSIDE_BLOCK_SCALAR, description: 'verify-looking line inside a block scalar is NOT a legacy line' },
  { name: 'invalid-malformed', text: INVALID_MALFORMED, description: 'fails YAML/JSON parse entirely' },
  { name: 'invalid-schema-violation', text: INVALID_SCHEMA_VIOLATION, description: 'parses as YAML but violates peac-policy/0.1 schema' },
  { name: 'empty', text: EMPTY, description: 'whitespace-only content' },
];
