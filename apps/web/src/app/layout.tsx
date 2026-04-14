import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-cinzel",
});

export const metadata: Metadata = {
  title: "Unseen Servant",
  description: "D&D 5e with an AI Game Master",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cinzel.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
