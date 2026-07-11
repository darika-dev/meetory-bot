import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(databaseUrl);

function splitSqlStatements(source: string) {
  const statements: string[] = [];
  let current = "";
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const rest = source.slice(index);

    if (dollarQuoteTag) {
      if (rest.startsWith(dollarQuoteTag)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      } else {
        current += character;
      }

      continue;
    }

    const dollarQuoteMatch = rest.match(/^\$[A-Za-z0-9_]*\$/);

    if (dollarQuoteMatch) {
      dollarQuoteTag = dollarQuoteMatch[0];
      current += dollarQuoteTag;
      index += dollarQuoteTag.length - 1;
      continue;
    }

    if (character === ";") {
      const statement = current.trim();

      if (statement) {
        statements.push(statement);
      }

      current = "";
      continue;
    }

    current += character;
  }

  const finalStatement = current.trim();

  if (finalStatement) {
    statements.push(finalStatement);
  }

  return statements;
}

const initSql = await readFile(join(process.cwd(), "db/init.sql"), "utf8");
const statements = splitSqlStatements(initSql);

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Database schema initialized.");
