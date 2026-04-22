import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Manager",
  description: "OpenClaw operator console",
  icons: {
    icon: "/ManageClaw-TB-DarkMode.png",
    shortcut: "/ManageClaw-TB-DarkMode.png",
    apple: "/ManageClaw-TB-DarkMode.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-dark text-text-primary antialiased">{children}</body>
    </html>
  );
}
