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
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection (kept alive)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception (kept alive)");
});

async function main() {
  // Restore credentials / Telegram sessions / settings from the database to
  // disk BEFORE the bot engine reads them, so logins survive redeploys. A DB
  // hiccup here must NOT prevent the server from starting — log and continue.
  try {
    await restoreConfigToDisk();
  } catch (err) {
    logger.error({ err }, "restoreConfigToDisk failed; starting with on-disk config only");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    // Construct the engine now so all logged-in accounts reconnect on boot.
    // Guard it: a reconnect failure must not crash the freshly-started server.
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
  });
}

// Stray promise rejections (e.g. a dropped GramJS/Baileys socket) are common and
// non-fatal — log and keep serving.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection (continuing)");
});
// An uncaught exception may have left the process in a bad state. Log and exit so
// the deployment's supervisor restarts a clean instance (which reconnects all
// accounts + the control bot) rather than limping along corrupted.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — exiting for a clean restart");
  process.exit(1);
});

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
