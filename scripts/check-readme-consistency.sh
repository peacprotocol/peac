#!/bin/bash
# scripts/check-readme-consistency.sh
# Validate README.md files for all public packages before npm publish
#
# Checks:
# 1. README.md exists for each public package
# 2. Contains correct install command (pnpm add @peac/<package-name>)
# 3. Contains required links (peacprotocol.org, originary.xyz, github)
# 4. Contains Apache-2.0 license reference
# 5. No malformed URLs (http instead of https for our domains)
# 6. Package name header matches package name

set -e

echo "=== Checking README consistency for npm packages ==="
echo ""

# Canonical URLs (substring match - full URLs are https://www.peacprotocol.org etc.)
DOCS_URL="www.peacprotocol.org"
ORIGINARY_URL="www.originary.xyz"
GITHUB_URL="github.com/peacprotocol/peac"

# Track errors
ERRORS=0
WARNINGS=0

# Find all public packages using pnpm (single source of truth)
echo "Discovering packages via pnpm..."
PUBLIC_PACKAGES=$(node -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const out = execSync('pnpm -r list --json --depth -1', { encoding: 'utf8' });
  const packages = JSON.parse(out);

  const results = packages
    .filter(p => p.name && p.name.startsWith('@peac/'))
    .filter(p => {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(p.path, 'package.json'), 'utf8'));
        return pkg.private !== true;
      } catch {
        return false;
      }
    })
    .map(p => JSON.stringify({ name: p.name, dir: p.path }))
    .join('\n');

  console.log('[' + results.split('\n').filter(Boolean).join(',') + ']');
} catch (err) {
  console.error('Failed to discover packages:', err.message);
  process.exit(1);
}
")

# Parse JSON and check each package
echo "$PUBLIC_PACKAGES" | node -e "
const fs = require('fs');
const path = require('path');
const input = require('fs').readFileSync(0, 'utf8');
const packages = JSON.parse(input);

let errors = 0;
let warnings = 0;

const DOCS_URL = '$DOCS_URL';
const ORIGINARY_URL = '$ORIGINARY_URL';
const GITHUB_URL = '$GITHUB_URL';

console.log('Found ' + packages.length + ' public packages');
console.log('');

for (const pkg of packages) {
  const readmePath = path.join(pkg.dir, 'README.md');
  const pkgName = pkg.name;
  const shortName = pkgName.replace('@peac/', '');

  console.log('Checking ' + pkgName + '...');

  // Check 1: README exists
  if (!fs.existsSync(readmePath)) {
    console.log('  ERROR: README.md not found');
    errors++;
    continue;
  }

  const content = fs.readFileSync(readmePath, 'utf8');

  // Check 2: Correct install command
  const installPattern = new RegExp('pnpm add ' + pkgName.replace('/', '\\\\/'));
  if (!installPattern.test(content)) {
    console.log('  ERROR: Missing or incorrect install command');
    console.log('         Expected: pnpm add ' + pkgName);
    errors++;
  }

  // Check 3: Required links
  if (!content.includes(DOCS_URL)) {
    console.log('  ERROR: Missing docs link (' + DOCS_URL + ')');
    errors++;
  }

  if (!content.includes(ORIGINARY_URL)) {
    console.log('  ERROR: Missing Originary link (' + ORIGINARY_URL + ')');
    errors++;
  }

  if (!content.includes(GITHUB_URL)) {
    console.log('  ERROR: Missing GitHub link (' + GITHUB_URL + ')');
    errors++;
  }

  // Check 4: Apache-2.0 license reference
  if (!content.includes('Apache-2.0')) {
    console.log('  ERROR: Missing Apache-2.0 license reference');
    errors++;
  }

  // Check 5: No malformed URLs (http instead of https for our domains)
  const malformedPatterns = [
    /htttps?:\\/\\//,
    /http:\\/\\/www\\.peacprotocol\\.org/,  // Should be https
    /http:\\/\\/www\\.originary\\./,          // Should be https
    /http:\\/\\/github\\.com/,                // Should be https
  ];

  for (const pattern of malformedPatterns) {
    if (pattern.test(content)) {
      console.log('  WARNING: Possible malformed URL detected');
      warnings++;
      break;
    }
  }

  // Check 6: Package name header matches
  const headerPattern = new RegExp('^# ' + pkgName.replace('/', '\\\\/'), 'm');
  if (!headerPattern.test(content)) {
    console.log('  WARNING: README header does not match package name');
    warnings++;
  }

  // Check 7: Standard footer format (informational)
  const footerPattern = /PEAC Protocol is an open source project stewarded by Originary/;
  if (!footerPattern.test(content)) {
    console.log('  WARNING: Missing standard footer');
    warnings++;
  }
}

console.log('');
console.log('====================================');
console.log('README CHECK SUMMARY');
console.log('====================================');
console.log('Packages checked: ' + packages.length);
console.log('Errors: ' + errors);
console.log('Warnings: ' + warnings);

if (errors > 0) {
  console.log('');
  console.log('FAIL: ' + errors + ' error(s) found');
  console.log('See docs/release/npm-readme-template.md for required format');
  process.exit(1);
} else {
  console.log('');
  console.log('OK: All READMEs pass validation');
}
"

echo ""
echo "Done."
