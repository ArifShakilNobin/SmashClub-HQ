import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmashClub HQ | Badminton & Sports Match Manager",
  description: "Manage match slots, vote players, and auto-balance teams.",
  icons: {
    icon: "/favicon.ico", // বা /favicon.png বা /favicon.svg
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}