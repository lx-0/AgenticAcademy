import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgenticAcademy — Learn to Work Alongside AI Agents",
  description:
    "The adaptive learning platform that closes the gap between professionals and the agentic economy. Personalized learning paths that evolve as fast as the field.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
