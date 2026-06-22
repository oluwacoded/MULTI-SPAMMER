import app from "./app";
import { logger } from "./lib/logger";
import { restoreConfigToDisk } from "./lib/configStore";
import { getBotInstance } from "./lib/botInstance";
import { startControlBot } from "./lib/controlBot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Keep the VM alive through transient background failures. The Telegram engine
// does a lot of fire-and-forget async work (boot reconnect-all, scrape/add jobs,
// setTimeout-driven add/campaign loops, incoming-message handlers). In Node a
// single unhandled rejection or uncaught exception in any of those would
// terminate the whole process — which on a Reserved VM means an outage, an
// automatic restart, and another reconnect storm that can crash again. Log and
// stay up instead so one bad Telegram/DB call never takes the server down.
//
// NOTE: there must be exactly ONE handler per event. Node invokes every
// registered listener, so a second `uncaughtException` handler that calls
// process.exit() would silently defeat this keep-alive policy and turn every
// stray background error back into a full restart + cold-start outage.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection (kept alive)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception (kept alive)");
});

// Restore credentials / Telegram sessions / settings from the DB to disk, then
// construct the engine (which reads them) and start the control bot. This runs
// AFTER the HTTP port is already open — see main() — so the platform health
// check on /api passes immediately instead of waiting out the DB restore.
async function bootstrap() {
  // A DB hiccup here must NOT prevent the server from serving — log and continue.
  try {
    await restoreConfigToDisk();
  } catch (err) {
    logger.error({ err }, "restoreConfigToDisk failed; starting with on-disk config only");
  }

  // Construct the engine so all logged-in accounts reconnect on boot. Guard it:
  // a reconnect failure must not crash the freshly-started server.
  try {
    getBotInstance();
  } catch (err) {
    logger.error({ err }, "Bot engine failed to initialise");
  }

  // Start the Telegram control bot ONLY in production. Telegram allows just one
  // long-poll consumer per bot token; if the dev workspace also started it, the
  // dev + deployed instances fight (409 Conflict) and crash-loop. Running it only
  // on the deployed VM keeps it online 24/7 and conflict-free.
  // Override for local testing with CONTROL_BOT_FORCE=1.
  const runControlBot =
    process.env["NODE_ENV"] === "production" || process.env["CONTROL_BOT_FORCE"] === "1";
  if (runControlBot) {
    try {
      startControlBot();
    } catch (err) {
      logger.error({ err }, "Control bot failed to start");
    }
  } else {
    logger.info(
      "Control bot not started in development (runs only on the deployed app to avoid a Telegram polling conflict)",
    );
  }
}

function main() {
  // Open the HTTP port FIRST so the deployment health check on /api gets a 200
  // within ~1s of boot. Previously the slow DB restore ran before app.listen(),
  // so on every restart /api returned 500 for ~10-15s (an uptime outage) until
  // the restore finished. Restore + engine init now happen in the background
  // once we're already accepting connections.
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
      return;
    }
    logger.info({ port }, "Server listening");
    void bootstrap();
  });
}

main();
