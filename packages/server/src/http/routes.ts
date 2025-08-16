/* istanbul ignore file */
import { Router } from "express";
import { handleVerify } from "./verify";
import { handlePayment } from "./payment";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { handleWellKnown } from "./wellKnown";

export function createRoutes() {
  const router = Router();

  router.get("/.well-known/peac.json", handleWellKnown);
  router.post("/verify", rateLimitMiddleware("verify"), handleVerify);
  router.post("/pay", rateLimitMiddleware("pay"), handlePayment);

  return router;
}
