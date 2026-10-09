import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { storeCheckoutMode } from "./lib/storeStripeRules";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
// Must precede JSON parsing; the managed sync verifies Stripe's signature.
app.post("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  if (storeCheckoutMode(process.env.NODE_ENV) === "off") { res.status(403).json({ error: "Stripe webhooks disabled." }); return; }
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") { res.status(400).json({ error: "Missing Stripe signature." }); return; }
  try {
    await WebhookHandlers.processWebhook(req.body as Buffer, signature);
    res.json({ received: true });
  } catch {
    res.status(400).json({ error: "Stripe webhook could not be verified." });
  }
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
})));

app.use("/api", router);

export default app;
