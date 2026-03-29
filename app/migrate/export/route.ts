import { createSupabaseServer } from "@/lib/supabase-server"
import { KnowledgeGraphManager } from "@/lib/graph-manager"
import { graphToJsonl, graphToJson } from "@/lib/migration"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format") === "json" ? "json" : "jsonl"

  const manager = new KnowledgeGraphManager(supabase, user.id)
  const graph = await manager.readGraph()

  const content = format === "json" ? graphToJson(graph) : graphToJsonl(graph)
  const filename = `memory.${format}`
  const mime = format === "json" ? "application/json" : "application/x-ndjson"

  return new Response(content, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
