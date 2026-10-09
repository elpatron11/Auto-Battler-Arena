import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

/** Connection credentials remain server-side and are fetched fresh for rotation. */
async function getStripeCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : null;
  if (!hostname || !token) throw new Error("Stripe connection is unavailable.");
  const response = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`, {
    headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Stripe connection could not be loaded.");
  const data = await response.json() as { items?: { settings?: { secret_key?: string; secret?: string; webhook_secret?: string } }[] };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret_key ?? settings?.secret;
  if (!secretKey) throw new Error("Stripe connection has no SDK secret key.");
  // Live credentials may be used only by the published production service.
  const requiredMode = process.env.NODE_ENV === "production" ? "live" : "test";
  if (!new RegExp(`^(sk|rk)_${requiredMode}_`).test(secretKey))
    throw new Error(`Stripe ${requiredMode} credentials are required for this environment.`);
  return { secretKey: secretKey as string, webhookSecret: settings?.webhook_secret };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync() {
  if (!process.env.DATABASE_URL) throw new Error("Database is required for Stripe.");
  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 1000, allowExitOnIdle: true },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
