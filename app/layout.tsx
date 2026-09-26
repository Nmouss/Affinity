import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Affinity",
  description: "A family council for thoughtful shared purchases.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
