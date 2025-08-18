import request from "supertest";
import { createServer } from "../../src/http/server";
import { Application } from "express";
import { standardRateLimiter, strictRateLimiter } from "../../src/middleware/enhanced-rate-limit";
import { idempotencyMiddleware } from "../../src/middleware/idempotency";

describe("Capabilities Endpoint", () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(() => {
    standardRateLimiter.destroy();
    strictRateLimiter.destroy();
    idempotencyMiddleware.destroy();
  });

  describe("GET /.well-known/peac-capabilities", () => {
    it("should return capabilities with correct content type", async () => {
      const res = await request(app)
        .get("/.well-known/peac-capabilities")
        .set("Accept", "application/vnd.peac.capabilities+json;version=0.9.6");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(
        /application\/vnd\.peac\.capabilities\+json.*version=0\.9\.6/
      );
      expect(res.body).toHaveProperty("version", "0.9.6");
      expect(res.body).toHaveProperty("conformance_level");
      expect(res.body.protocols.bridges).toContain("mcp");
      expect(res.body.protocols.bridges).toContain("a2a");
      expect(res.body.payments.rails).toContain("credits");
      expect(res.body.payments.rails).toContain("x402:ethereum");
      expect(res.body.payments.rails).toContain("stripe:fiat");
      expect(res.body.payments.status["x402:ethereum"]).toBe(
        "simulation (prod-ready)"
      );
    });

    it("should return 406 for unsupported media type", async () => {
      const res = await request(app)
        .get("/.well-known/peac-capabilities")
        .set("Accept", "text/plain");

      expect(res.status).toBe(406);
      expect(res.body).toHaveProperty("type");
      expect(res.body).toHaveProperty("title", "Not Acceptable");
    });

    it("should accept application/json as fallback", async () => {
      const res = await request(app)
        .get("/.well-known/peac-capabilities")
        .set("Accept", "application/json");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("version", "0.9.6");
    });
  });
});