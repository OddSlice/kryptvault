// Shared Neon connection for the API routes (files starting with _ are not
// deployed as routes). DATABASE_URL is set by the Vercel Neon integration.
import { neon } from '@neondatabase/serverless';

let sql;

export function query(text, params) {
  if (!sql) sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  return sql.query(text, params);
}
