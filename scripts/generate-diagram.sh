#!/usr/bin/env bash
set -euo pipefail

# Generate SVG diagram from Mermaid source
# Usage: ./scripts/generate-diagram.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

INPUT="$ROOT_DIR/docs/diagrams/peac-proof-flow.mmd"
OUTPUT="$ROOT_DIR/docs/diagrams/peac-proof-flow.svg"

# Check if mmdc (mermaid-cli) is installed
if ! command -v mmdc &> /dev/null; then
  echo "Error: mermaid-cli not found"
  echo ""
  echo "Install with:"
  echo "  npm install -g @mermaid-js/mermaid-cli"
  echo ""
  echo "Or use Docker:"
  echo "  docker run --rm -v \"\$PWD:/data\" minlag/mermaid-cli -i /data/docs/diagrams/peac-proof-flow.mmd -o /data/docs/diagrams/peac-proof-flow.svg"
  exit 1
fi

echo "Generating SVG from $INPUT..."
mmdc -i "$INPUT" -o "$OUTPUT" -t neutral -b transparent

if [ -f "$OUTPUT" ]; then
  echo "✓ Generated: $OUTPUT"
  echo ""
  echo "To use in README:"
  echo "  ![PEAC proof flow](docs/diagrams/peac-proof-flow.svg)"
else
  echo "✗ Failed to generate SVG"
  exit 1
fi
