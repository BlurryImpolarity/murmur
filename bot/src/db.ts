import { createDb } from "@murmur/db";
import { env } from "./env";

export const db = createDb(env.databaseUrl);
