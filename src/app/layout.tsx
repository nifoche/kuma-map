import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "熊出没マップ | 全国の熊出没情報",
  description: "全国の熊出没スポットを地図上で確認できるサイト。最新のニュースから自動収集した情報を表示します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <header className="bg-primary text-primary-foreground py-4 px-6 shadow-md">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <span className="text-2xl">🐻</span>
            <h1 className="text-xl font-bold">熊出没マップ</h1>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>
        <footer className="bg-muted py-4 px-6 mt-8">
          <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
            <p>ニュースから自動収集した情報を表示しています。正確性は保証されません。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
