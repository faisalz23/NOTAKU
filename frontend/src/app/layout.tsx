import "./globals.css";  // global utama
import "./auth.css";     // css auth (sekarang satu folder dgn layout)
import { Inter } from "next/font/google";
import { ReactNode } from "react";
import ErrorHandler from "./components/ErrorHandler";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "NotaKu - Notulensi Otomatis Rapat dengan AI",
  description: "Aplikasi notulensi otomatis rapat menggunakan Speech-to-Text dan AI Summarization. Ubah percakapan rapat menjadi notulensi profesional secara otomatis.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <ErrorHandler />
        {children}
      </body>
    </html>
  );
}
