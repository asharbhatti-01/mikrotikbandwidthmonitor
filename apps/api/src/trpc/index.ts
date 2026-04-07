import { router, publicProcedure, authedProcedure, protectedProcedure } from "./init.js";
import { authRouter } from "./routers/auth.js";
import { devicesRouter } from "./routers/devices.js";
import { orgsRouter } from "./routers/orgs.js";
import { configRouter } from "./routers/config.js";
import { alertsRouter } from "./routers/alerts.js";
import { billingRouter } from "./routers/billing.js";
import { auditRouter } from "./routers/audit.js";

export { router, publicProcedure, authedProcedure, protectedProcedure };

export const appRouter = router({
  auth: authRouter,
  devices: devicesRouter,
  orgs: orgsRouter,
  config: configRouter,
  alerts: alertsRouter,
  billing: billingRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
