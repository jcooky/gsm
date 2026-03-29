import { createSupabaseServer } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { MigrateForm } from "./migrate-form"

export default async function MigratePage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/migrate")
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <a href="/" className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors mb-8 inline-block">
        ← Back
      </a>

      <h1 className="text-3xl font-bold mb-2">Migrate your memory</h1>
      <p className="text-neutral-400 mb-8">
        Import your existing <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-sm">memory.json</code> or{" "}
        <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-sm">memory.jsonl</code> file from the local MCP memory server.
      </p>

      <MigrateForm />
    </main>
  )
}
