// GET /api/exhibitions/:id -> PublicExhibition, no sign-in needed
// 404 for a bad id, a private exhibition or a missing one, so existence isn't revealed.

import { NextResponse } from "next/server";
import { loadPublicExhibition } from "@/server/db/publicExhibition";
import { DB_FAILED, fail } from "@/server/http";
import { supabaseStateless } from "@/server/supabase";
import { isUuid } from "@/server/validate";

const NOT_FOUND = "비공개이거나 없는 전시예요";
const NO_STORE = { "Cache-Control": "no-store" }; // turning an exhibition private must take effect at once

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: NOT_FOUND }, { status: 404, headers: NO_STORE });

  try {
    // Publishable key with no cookies = anon role, so only the public RLS policies apply.
    const ex = await loadPublicExhibition(supabaseStateless(), id);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[GET /api/exhibitions/${id}]`, ex ? `found, ${ex.items.length} items` : "404");
    }
    if (!ex) return NextResponse.json({ error: NOT_FOUND }, { status: 404, headers: NO_STORE });
    return NextResponse.json(ex, { headers: NO_STORE });
  } catch (err) {
    return fail(err, DB_FAILED);
  }
}
