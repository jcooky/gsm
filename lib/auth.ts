import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface AuthContext {
  supabase: SupabaseClient
  userId: string
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    throw new AuthError("Missing Authorization header")
  }

  const token = authHeader.replace("Bearer ", "")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createClient(url, anonKey)
  const { data, error } = await (supabase.auth as any).getClaims(token)

  if (error || !data?.claims?.sub) {
    throw new AuthError("Invalid or expired token")
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  return { supabase: userClient, userId: data.claims.sub }
}
