import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { adminsTable } from "@murmur/db";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const getAdmin = cache(async () => {
    const adminId = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    if (!adminId) return null;
    const admin = await db.query.adminsTable.findFirst({
        columns: { id: true, login: true },
        where: eq(adminsTable.id, adminId),
    });
    return admin ?? null;
});

export async function requireAdmin() {
    const admin = await getAdmin();
    if (!admin) redirect("/login");
    return admin;
}
