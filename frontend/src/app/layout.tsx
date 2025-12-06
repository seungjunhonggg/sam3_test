import type { Metadata } from "next";
import { Providers, ColorSchemeScript } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAM3 라벨링 도구",
  description: "AI 기반 이미지 세그멘테이션 라벨링 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body style={{ margin: 0, padding: 0, minHeight: '100vh' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
