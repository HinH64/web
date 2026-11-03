import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾光 · 中文閱讀器",
  description: "線上找書、個人書架、閱讀與章節更新。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
