import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

export interface AuthContext {
  supabase: SupabaseClient
  userId: string
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    throw new AuthError("Missing Authorization header")
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new AuthError("Invalid or expired token")
  }

  return { supabase, userId: user.id }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}
