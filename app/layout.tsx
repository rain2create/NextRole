import type { Metadata } from "next";
import localFont from "next/font/local";
import { Appearance } from "./appearance";
import "./globals.css";
import "./appearance.css";

const inter = localFont({ src: "../public/landing/inter.woff2", variable: "--font-sans", weight: "100 900" });
const rounded = localFont({ src: "../public/fonts/nunito-latin.woff2", variable: "--font-rounded", weight: "200 1000", display: "swap" });
const friendly = localFont({ src: "../public/fonts/wenkai-ui.woff2", variable: "--font-friendly", weight: "400", display: "swap", preload: false });
const serif = localFont({
  src: "../public/landing/instrument-serif-italic.woff2",
  variable: "--font-serif",
  style: "italic",
  weight: "400",
});

export const metadata: Metadata = {
  title: "NextRole — 智能求职工作台",
  description: "发现合适的岗位，定制简历，辅助投递，在一个工作台掌握每一步求职进展。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${serif.variable} ${rounded.variable} ${friendly.variable}`}>
      <body><Appearance />{children}</body>
    </html>
  );
}
