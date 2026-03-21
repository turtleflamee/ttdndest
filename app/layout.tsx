import type { Metadata } from "next";
import "./globals.css";
import ConditionalNav from "./components/ConditionalNav";

export const metadata: Metadata = {
  title: "TTDND",
  description: "Tabletop D&D — AI-Powered Interactive Audiobook Card Game",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ConditionalNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
