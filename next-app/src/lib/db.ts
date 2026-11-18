import { createDb, type Db } from "@murmur/db";

const globalForDb = globalThis as unknown as { db?: Db };

// single pool across dev hot reloads
export const db = (globalForDb.db ??= createDb(process.env.DATABASE_URL!));
