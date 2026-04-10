#!/usr/bin/env bash
# verify-pilot-output.sh
#
# Engineering gate for PR 7: validates pilot artifact schema and content.
# Runs the pilot script and verifies the output artifact meets requirements.
#
# Exit 0: pilot artifact valid
# Exit 1: validation failed

set -euo pipefail

echo "=== Pilot Output Gate ==="

ARTIFACT_DIR="${1:-.}"

# Step 1: Run the pilot script
echo "1. Running pilot script..."
cd examples/external-pilot
PILOT_ORG="gate-test-org" PILOT_ISSUER="https://gate-test.example.com" npx tsx pilot.ts 2>&1
cd ../..

# Step 2: Find the artifact
ARTIFACT=$(ls examples/external-pilot/pilot-artifact-*.json 2>/dev/null | head -1)
if [ -z "$ARTIFACT" ]; then
  echo "FAIL: No pilot artifact generated"
  exit 1
fi
echo "2. Artifact found: $ARTIFACT"

# Step 3: Validate JSON structure
echo "3. Validating artifact schema..."
node -e "
const fs = require('fs');
const artifact = JSON.parse(fs.readFileSync('$ARTIFACT', 'utf8'));

const required = ['pilot_id', 'pilot_organization', 'issuer', 'kid', 'receipt_ref', 'verified', 'verified_at', 'wire_version', 'reference_verifier_url', 'verification_method'];
const missing = required.filter(k => !(k in artifact));
if (missing.length > 0) {
  console.error('FAIL: Missing required fields:', missing.join(', '));
  process.exit(1);
}

// Validate field types
if (typeof artifact.pilot_id !== 'string' || !artifact.pilot_id.match(/^[0-9a-f-]{36}$/)) {
  console.error('FAIL: pilot_id is not a valid UUID');
  process.exit(1);
}
if (!artifact.receipt_ref.startsWith('sha256:')) {
  console.error('FAIL: receipt_ref does not start with sha256:');
  process.exit(1);
}
if (typeof artifact.verified !== 'boolean') {
  console.error('FAIL: verified is not boolean');
  process.exit(1);
}
if (!['local', 'reference_verifier'].includes(artifact.verification_method)) {
  console.error('FAIL: verification_method must be local or reference_verifier');
  process.exit(1);
}
if (artifact.wire_version !== '0.2') {
  console.error('FAIL: wire_version must be 0.2');
  process.exit(1);
}

console.log('   Schema validation: PASS');
console.log('   Fields:', Object.keys(artifact).length);
console.log('   Verified:', artifact.verified);
console.log('   Method:', artifact.verification_method);
"

# Step 4: Check no private key material
echo "4. Checking for private key material..."
if grep -qi "private\|secret\|seed" "$ARTIFACT" 2>/dev/null; then
  # Allow 'private' only as part of field names we don't have
  SUSPICIOUS=$(grep -oi "private_key\|secret\|seed" "$ARTIFACT" 2>/dev/null || true)
  if [ -n "$SUSPICIOUS" ]; then
    echo "FAIL: Artifact contains suspicious key material: $SUSPICIOUS"
    exit 1
  fi
fi
echo "   No private key material found: PASS"

# Step 5: Cleanup
rm -f "$ARTIFACT"

echo ""
echo "=== PASS: Pilot output gate verified ==="
