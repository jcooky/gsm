import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface AuthContext {
  supabase: SupabaseClient
  userId: string
}

export class AuthError extends Error {
  readonly isExpired: boolean

  constructor(message: string, isExpired = false) {
    super(message)
    this.name = "AuthError"
    this.isExpired = isExpired
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.exp && payload.exp < Math.floor(Date.now() / 1000)
  } catch {
    return false
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
    const expired = isTokenExpired(token)
    throw new AuthError(
      expired ? "Token expired" : "Invalid token",
      expired,
    )
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  return { supabase: userClient, userId: data.claims.sub }
}
