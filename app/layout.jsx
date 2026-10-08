import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "SOFT"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata = {
  title: "Natalia",
  description: "A game of tic-tac-toe you will not win. Every move is settled on Avalanche, and you never pay gas.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning /* browser extensions add attributes here */>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
