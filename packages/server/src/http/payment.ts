/* istanbul ignore file */
import type { Request, Response } from "express";
import { metrics } from "../metrics";

type PaymentProvider = {
  processPayment(body: unknown): Promise<string>;
};

async function loadProvider(): Promise<{
  name: "x402" | "stripe";
  Provider: new () => PaymentProvider;
}> {
  const mode = (process.env.PAYMENT_PROVIDER || "x402").toLowerCase();

  if (mode === "stripe") {
    const mod = await import("../payments/stripe-credits");
    return { name: "stripe", Provider: mod.StripeCreditsProvider };
  }

  const mod = await import("../x402");
  return { name: "x402", Provider: mod.X402Provider };
}

export async function handlePayment(
  req: Request,
  res: Response,
): Promise<void> {
  // Do not set any x-peac-* header here; middleware will echo 0.9.5.
  try {
    const { name, Provider } = await loadProvider();
    metrics.paymentAttempt.inc({ provider: name, outcome: "attempt" });

    const provider = new Provider();
    const session = await provider.processPayment(req.body as unknown);

    res.setHeader("Authorization", `Bearer ${session}`);
    res.status(200).json({ ok: true, session });

    metrics.paymentAttempt.inc({ provider: name, outcome: "success" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "payment_failed";
    const label =
      (process.env.PAYMENT_PROVIDER || "x402").toLowerCase() === "stripe"
        ? "stripe"
        : "x402";
    metrics.paymentAttempt.inc({
      provider: label as "x402" | "stripe",
      outcome: "failure",
    });

    res.status(400).json({ ok: false, error: message });
  }
}
