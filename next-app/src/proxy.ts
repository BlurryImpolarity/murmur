import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Cheap signature check only; pages, actions and routes re-check the admin in db
export function proxy(request: NextRequest) {
    if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
    if (request.nextUrl.pathname.startsWith("/api/")) return new NextResponse(null, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
    matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
