import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Spline_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});
const body = Spline_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600"] });
const mono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Sealed — confidential payments on Stellar",
  description:
    "Peer-to-peer payments where amounts and balances stay sealed on-chain. Built on OpenZeppelin's Confidential Token developer preview (Stellar testnet).",
};

export const viewport: Viewport = {
  themeColor: "#14242F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
