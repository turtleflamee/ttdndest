import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/unlock",
  "/player-entry",
  "/player-view",
  "/api/unlock",
  "/api/player/",
  "/api/games/",
  "/api/hardware/scan",
  "/api/hardware/test-scan",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/game-library") ||
      pathname.startsWith("/play") || pathname.startsWith("/settings") ||
      pathname.startsWith("/prompts") || pathname.startsWith("/baby-ai") ||
      pathname.startsWith("/memory") || pathname.startsWith("/hardware") ||
      pathname.startsWith("/cards")) {
    const auth = request.cookies.get("ttdnd_auth");
    if (!auth || auth.value !== "true") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/unlock", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|audio/).*)"],
};
