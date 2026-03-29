import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
    const { error } = await supabase.from("namespaces").select("id").limit(1)
    if (error) throw error

    return Response.json({ status: "ok" })
  } catch (err) {
    return Response.json({ status: "error", message: String(err) }, { status: 503 })
  }
})
