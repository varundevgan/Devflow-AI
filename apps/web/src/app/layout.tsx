import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#ffffff", color: "#111111", fontFamily: "sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
