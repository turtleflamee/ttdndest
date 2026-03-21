import { NextRequest, NextResponse } from "next/server";
import { getGame, updateGame, deleteGame } from "@/lib/storage";
import type { GameState } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  try {
    const game = await getGame(id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  try {
    const existing = await getGame(id);
    if (!existing) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const partial = (await req.json()) as Partial<GameState>;
    const merged: GameState = {
      ...existing,
      ...partial,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    await updateGame(merged);
    return NextResponse.json(merged);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  try {
    await deleteGame(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to delete game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
