"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const isUnlocked = document.cookie.includes("ttdnd_auth=true");
    router.replace(isUnlocked ? "/game-library" : "/unlock");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-[var(--text-secondary)]">Loading...</div>
    </div>
  );
}
