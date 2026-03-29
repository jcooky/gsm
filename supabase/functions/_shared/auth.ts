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

  const token = authHeader.replace("Bearer ", "")

  // Use a single client with the publishable key + pass user token to getClaims
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  )

  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) {
    throw new AuthError("Invalid or expired token")
  }

  // Build a user-scoped client for RLS queries
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )

  return { supabase: userClient, userId: data.claims.sub }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}
