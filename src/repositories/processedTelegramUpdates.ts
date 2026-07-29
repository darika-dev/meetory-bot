import { sql } from "../db/client.js";

export type TelegramUpdateStatus = "processing" | "completed" | "failed";

export async function claimTelegramUpdate(input: {
  updateId: number;
  updateType: string;
  expiresAt?: Date;
}) {
  const rows = await sql`
    INSERT INTO processed_telegram_updates (
      update_id,
      update_type,
      status,
      expires_at
    )
    VALUES (
      ${input.updateId},
      ${input.updateType},
      'processing',
      ${input.expiresAt?.toISOString() ?? null}
    )
    ON CONFLICT (update_id) DO NOTHING
    RETURNING update_id
  ` as { update_id: string }[];

  return rows.length > 0;
}

export async function markTelegramUpdateCompleted(updateId: number) {
  await sql`
    UPDATE processed_telegram_updates
    SET status = 'completed',
        completed_at = NOW(),
        error_code = NULL
    WHERE update_id = ${updateId}
  `;
}

export async function markTelegramUpdateFailed(updateId: number, errorCode: string) {
  await sql`
    UPDATE processed_telegram_updates
    SET status = 'failed',
        completed_at = NOW(),
        error_code = ${errorCode}
    WHERE update_id = ${updateId}
  `;
}

export async function cleanupOldTelegramUpdates() {
  await sql`
    DELETE FROM processed_telegram_updates
    WHERE created_at < NOW() - INTERVAL '30 days'
  `;
}
