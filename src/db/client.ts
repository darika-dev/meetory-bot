import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

export const sql = databaseUrl
  ? neon(databaseUrl)
  : ((() => {
      throw new Error("DATABASE_URL is required");
    }) as unknown as ReturnType<typeof neon>);
