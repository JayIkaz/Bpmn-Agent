import app from "./app";
import { logger } from "./lib/logger";

// Replit used to supply PORT; nothing does off-platform, so this defaults.
// Only relevant to `pnpm start` — on Vercel the serverless entrypoint imports
// app.ts directly and never calls listen().
const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
