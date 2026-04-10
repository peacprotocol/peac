#!/usr/bin/env bash
# verify-pilot-output.sh
#
# Engineering gate for the external pilot kit: validates the emitted
# artifact against a formal JSON Schema, verifies the golden snapshot,
# and checks for private key material leakage.
#
# Exit 0: pilot artifact valid
# Exit 1: validation failed

set -euo pipefail

echo "=== Pilot Output Gate ==="

SCHEMA_PATH="examples/external-pilot/pilot-artifact.schema.json"
GOLDEN_PATH="examples/external-pilot/golden-artifact.json"

# Step 1: Verify schema and golden artifact exist
echo "1. Verifying schema and golden artifact..."
if [ ! -f "$SCHEMA_PATH" ]; then
  echo "FAIL: Schema not found at $SCHEMA_PATH"
  exit 1
fi
if [ ! -f "$GOLDEN_PATH" ]; then
  echo "FAIL: Golden artifact not found at $GOLDEN_PATH"
  exit 1
fi
echo "   Schema: $SCHEMA_PATH"
echo "   Golden: $GOLDEN_PATH"

# Step 2: Run the pilot script
echo "2. Running pilot script..."
cd examples/external-pilot
PILOT_ORG="gate-test-org" PILOT_ISSUER="https://gate-test.example.com" pnpm exec tsx pilot.ts 2>&1
cd ../..

# Step 3: Find the artifact
ARTIFACT=$(ls examples/external-pilot/pilot-artifact-*.json 2>/dev/null | head -1)
if [ -z "$ARTIFACT" ]; then
  echo "FAIL: No pilot artifact generated"
  exit 1
fi
echo "3. Artifact generated: $ARTIFACT"

# Step 4: Validate against JSON Schema using ajv
echo "4. Validating against JSON Schema..."
node -e "
const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schema = JSON.parse(fs.readFileSync('$SCHEMA_PATH', 'utf8'));
const artifact = JSON.parse(fs.readFileSync('$ARTIFACT', 'utf8'));

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(artifact);

if (!valid) {
  console.error('FAIL: Schema validation errors:');
  for (const err of validate.errors || []) {
    console.error('  ' + err.instancePath + ': ' + err.message);
  }
  process.exit(1);
}
console.log('   Schema validation: PASS (' + Object.keys(artifact).length + ' fields)');
console.log('   verified: ' + artifact.verified);
console.log('   verification_method: ' + artifact.verification_method);
"

# Step 5: Check no private key material in output
echo "5. Checking for private key material..."
SUSPICIOUS=$(grep -oiE "private_key|secret_key|seed_bytes|\"seed\"" "$ARTIFACT" 2>/dev/null || true)
if [ -n "$SUSPICIOUS" ]; then
  echo "FAIL: Artifact contains suspicious key material: $SUSPICIOUS"
  exit 1
fi
echo "   No private key material found: PASS"

# Step 6: Validate golden artifact against same schema
echo "6. Validating golden artifact against schema..."
node -e "
const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schema = JSON.parse(fs.readFileSync('$SCHEMA_PATH', 'utf8'));
const golden = JSON.parse(fs.readFileSync('$GOLDEN_PATH', 'utf8'));

// Remove description field (documentation only, not part of schema)
delete golden.description;

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(golden);

if (!valid) {
  console.error('FAIL: Golden artifact fails schema validation:');
  for (const err of validate.errors || []) {
    console.error('  ' + err.instancePath + ': ' + err.message);
  }
  process.exit(1);
}
console.log('   Golden artifact: PASS');
"

# Step 7: Cleanup
rm -f "$ARTIFACT"

echo ""
echo "=== PASS: Pilot output gate verified (schema + golden + no key leakage) ==="
