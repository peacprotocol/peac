#!/usr/bin/env bash
# Guard against hidden/bidi Unicode characters in source files
# These can be used for supply-chain attacks (what you see != what parses)

set -euo pipefail

echo "Checking for hidden/bidi Unicode characters..."

python3 - <<'PY'
import pathlib, unicodedata, sys

# Directories to check
roots = [
    "package.json",
    "packages/",
    "specs/",
    "docs/",
]

# Problematic Unicode ranges
PROBLEMATIC_RANGES = [
    (0x200B, 0x200F),  # ZWSP, ZWNJ, ZWJ, LRM, RLM
    (0x202A, 0x202E),  # Bidi embedding controls
    (0x2066, 0x2069),  # Bidi isolate controls
    (0x00A0, 0x00A0),  # NBSP (suspicious in code)
]

def is_problematic(ch):
    cp = ord(ch)
    for start, end in PROBLEMATIC_RANGES:
        if start <= cp <= end:
            return True
    # Also check control characters (except normal whitespace)
    if ch not in "\n\t\r" and unicodedata.category(ch).startswith("C"):
        return True
    return False

bad = []
for r in roots:
    p = pathlib.Path(r)
    if not p.exists():
        continue
    files = [p] if p.is_file() else [f for f in p.rglob("*") if f.is_file() and f.suffix in (".ts", ".tsx", ".js", ".json", ".md")]
    for f in files:
        try:
            s = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for line_num, line in enumerate(s.splitlines(), 1):
            for col, ch in enumerate(line, 1):
                if is_problematic(ch):
                    name = unicodedata.name(ch, f"U+{ord(ch):04X}")
                    bad.append(f"{f}:{line_num}:{col}: {name}")

if bad:
    print("ERROR: Hidden/bidi Unicode characters found:")
    for b in bad[:20]:  # Limit output
        print(f"  {b}")
    if len(bad) > 20:
        print(f"  ... and {len(bad) - 20} more")
    sys.exit(1)
else:
    print("OK: No hidden/bidi Unicode characters found")
    sys.exit(0)
PY
