module.exports = function peacMiddleware(pricing) {
  return function (req, res, next) {
    const result = checkAccess(pricing, req.headers, req);
    if (!result.access) return res.status(402).send(`Payment Required via PEAC: ${result.reason}`);
    next();
  };
};

// Stub for POST /.well-known/peac/verify
// Use in app.post('/.well-known/peac/verify', (req, res) => { res.json(checkAccess(pricing, req.headers, req)); });