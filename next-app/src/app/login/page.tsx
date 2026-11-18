import { connection } from "next/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appName } from "@/lib/app-name";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
    // render per request so APP_NAME is read at runtime, not baked in at build
    await connection();

    return (
        <main className="flex min-h-dvh items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>{appName()}</CardTitle>
                </CardHeader>
                <CardContent>
                    <LoginForm />
                </CardContent>
            </Card>
        </main>
    );
}
