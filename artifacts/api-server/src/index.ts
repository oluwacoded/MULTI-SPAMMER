import app from "./app";
import { logger } from "./lib/logger";
import { restoreConfigToDisk } from "./lib/configStore";
import { getBotInstance } from "./lib/botInstance";

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

async function main() {
  // Restore credentials / Telegram sessions / settings from the database to
  // disk BEFORE the bot engine reads them, so logins survive redeploys.
  await restoreConfigToDisk();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    // Construct the engine now so all logged-in accounts reconnect on boot.
    getBotInstance();
  });
}

main();
