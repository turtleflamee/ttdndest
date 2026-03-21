"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";

export default function ConditionalNav() {
  const pathname = usePathname();
  const isPlayerPage = pathname?.startsWith("/player-") || pathname === "/unlock";
  if (isPlayerPage) return null;
  return <Nav />;
}
