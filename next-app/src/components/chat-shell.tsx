"use client";

import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

// Two panes on desktop; on mobile shows either the list or the open conversation
export function ChatShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
    const { id } = useParams<{ id?: string }>();
    const open = Boolean(id);

    return (
        <div className="flex h-dvh overflow-hidden">
            <aside className={cn("w-full flex-col md:flex md:w-80 md:shrink-0 md:border-r", open ? "hidden" : "flex")}>
                {sidebar}
            </aside>
            <main className={cn("min-w-0 flex-1 flex-col md:flex", open ? "flex" : "hidden")}>{children}</main>
        </div>
    );
}
