import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pachi Tracker - 業務管理システム",
  description: "パチンコツール開発・販売会社の部署別ワークフロー管理システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <nav className="bg-slate-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:text-blue-300 transition-colors">
                <span>🎰</span>
                <span>Pachi Tracker</span>
              </Link>
              <div className="flex items-center gap-6 text-sm">
                <Link href="/" className="hover:text-blue-300 transition-colors">
                  ホーム
                </Link>
                <Link href="/departments" className="hover:text-blue-300 transition-colors">
                  部署一覧
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 mt-16 py-6 text-center text-sm text-slate-500">
          <p>© 2025 Pachi Tracker - 業務管理システム</p>
        </footer>
      </body>
    </html>
  );
}
