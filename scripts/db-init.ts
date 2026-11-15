/**
 * Enables the pgvector extension. Run once before `drizzle-kit push`:
 *   npm run db:setup
 */
import "dotenv/config";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing. Add it to .env.local.");
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  const { rows } = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  console.log(`pgvector enabled (version ${rows[0]?.extversion}).`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
