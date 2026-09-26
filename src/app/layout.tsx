import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "ReddSphere", description: "Private Reddit research and evidence workspace" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
