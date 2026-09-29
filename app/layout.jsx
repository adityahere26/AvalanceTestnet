import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Gasless Tic-Tac-Toe · Avalanche",
  description: "On-chain Tic-Tac-Toe on Avalanche Fuji. Every move is a transaction, and players never pay gas.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning /* browser extensions add attributes here */>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
