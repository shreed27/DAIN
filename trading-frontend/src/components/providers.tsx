"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";
import { SolanaWalletProvider } from "@/components/providers/WalletProvider";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SolanaWalletProvider>
            {children}
        </SolanaWalletProvider>
    );
}
