"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export function LoginForm() {
    const [error, action, pending] = useActionState(login, null);

    return (
        <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <Label htmlFor="login">Login</Label>
                <Input id="login" name="login" autoComplete="username" required autoFocus />
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={pending}>
                Sign in
            </Button>
        </form>
    );
}
