import "./globals.css";
import React from "react";

export const metadata = {
  title: "AI File Manager v2",
  description: "Next.js app shell for the file manager UI refresh",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
