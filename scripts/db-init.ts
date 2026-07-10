import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "../src/db/client.ts";

const initSql = await readFile(join(process.cwd(), "db/init.sql"), "utf8");
const statements = initSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Database schema initialized.");
