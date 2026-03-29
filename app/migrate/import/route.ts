import { createSupabaseServer } from "@/lib/supabase-server"
import { KnowledgeGraphManager } from "@/lib/graph-manager"
import { parseMemoryFile } from "@/lib/migration"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { content } = await req.json()
  if (typeof content !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 })
  }

  const { graph, errors, format } = parseMemoryFile(content)

  if (errors.length > 0 && graph.entities.length === 0 && graph.relations.length === 0) {
    return NextResponse.json({ error: "Parse failed", errors }, { status: 422 })
  }

  const manager = new KnowledgeGraphManager(supabase, user.id)
  const createdEntities = await manager.createEntities(graph.entities)
  const createdRelations = await manager.createRelations(graph.relations)

  return NextResponse.json({
    format,
    imported: {
      entities: createdEntities.length,
      relations: createdRelations.length,
    },
    skipped: {
      entities: graph.entities.length - createdEntities.length,
      relations: graph.relations.length - createdRelations.length,
    },
    warnings: errors,
  })
}
