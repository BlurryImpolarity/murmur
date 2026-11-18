"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { adminsTable, verifyPassword } from "@murmur/db";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";

export async function login(_state: string | null, formData: FormData): Promise<string | null> {
    const login = String(formData.get("login") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const admin = await db.query.adminsTable.findFirst({ where: eq(adminsTable.login, login) });
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) return "Invalid login or password";

    (await cookies()).set(SESSION_COOKIE, createSessionToken(admin.id), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_TTL_SECONDS,
        path: "/",
    });
    redirect("/");
}

export async function logout() {
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/login");
}
