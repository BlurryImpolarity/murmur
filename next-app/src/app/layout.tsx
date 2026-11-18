import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Noto_Sans } from "next/font/google";
import { appName } from "@/lib/app-name";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const notoSans = Noto_Sans({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

export function generateMetadata(): Metadata {
    return { title: appName() };
}

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={cn("font-sans antialiased", notoSans.variable)} suppressHydrationWarning>
            <body>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
