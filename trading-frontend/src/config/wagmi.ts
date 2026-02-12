import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, base, arbitrum, polygon } from "wagmi/chains";

export const config = getDefaultConfig({
    appName: "Trading Orchestrator",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
    chains: [mainnet, base, arbitrum, polygon],
    ssr: true,
});
