import { sql } from "../db/client.js";

export function buildEventSourceIdempotencyKey(input: {
  chatId: string;
  messageId: string;
}) {
  return `telegram-message:${input.chatId}:${input.messageId}:confirm-event`;
}

export async function claimEventSource(input: {
  idempotencyKey: string;
  userId: string;
}) {
  const rows = await sql`
    INSERT INTO event_source_claims (
      idempotency_key,
      user_id,
      status
    )
    VALUES (
      ${input.idempotencyKey},
      ${input.userId},
      'processing'
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key
  ` as { idempotency_key: string }[];

  return rows.length > 0;
}

export async function markEventSourceCompleted(idempotencyKey: string) {
  await sql`
    UPDATE event_source_claims
    SET status = 'completed',
        completed_at = NOW(),
        error_code = NULL
    WHERE idempotency_key = ${idempotencyKey}
  `;
}

export async function markEventSourceFailed(idempotencyKey: string, errorCode: string) {
  await sql`
    UPDATE event_source_claims
    SET status = 'failed',
        completed_at = NOW(),
        error_code = ${errorCode}
    WHERE idempotency_key = ${idempotencyKey}
  `;
}
