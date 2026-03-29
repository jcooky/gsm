import { createSupabaseServer } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  const { origin } = new URL(req.url)
  return NextResponse.redirect(`${origin}/login`)
}
