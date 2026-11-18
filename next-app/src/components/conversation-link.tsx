"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function ConversationLink({ id, children }: { id: string; children: React.ReactNode }) {
    const params = useParams<{ id?: string }>();

    return (
        <Link
            href={`/c/${id}`}
            className={cn(
                "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted",
                params.id === id && "bg-muted"
            )}
        >
            {children}
        </Link>
    );
}
