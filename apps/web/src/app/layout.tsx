import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Dungeon Master",
  description: "D&D 5e with an AI Game Master",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
