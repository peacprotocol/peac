function parseDuration(str) {
  const match = /^([0-9]+)(ms|s|m|h|d)$/.exec(str);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 'ms': return val;
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

module.exports = parseDuration;
