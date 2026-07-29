import "dotenv/config";
import { cleanupOldTelegramUpdates } from "../src/repositories/processedTelegramUpdates.js";

await cleanupOldTelegramUpdates();

console.log("Old processed Telegram updates cleaned up.");
