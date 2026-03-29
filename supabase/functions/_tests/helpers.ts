import { createClient, SupabaseClient } from "@supabase/supabase-js"

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321"
export const SUPABASE_ANON_KEY = Deno.env.get("SB_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
export const MCP_URL = Deno.env.get("MCP_URL") ?? "http://127.0.0.1:54321/functions/v1/mcp"
export const HEALTH_URL = Deno.env.get("HEALTH_URL") ?? "http://127.0.0.1:54321/functions/v1/health"

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    realtime: { heartbeatIntervalMs: 0 },
  })
}

export interface TestUser {
  id: string
  email: string
  accessToken: string
  client: SupabaseClient
}

export async function createTestUser(suffix: string): Promise<TestUser> {
  const admin = adminClient()
  const email = `test-${suffix}-${Date.now()}@gsm-test.local`
  const password = "Test1234!gsm"

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) throw new Error(`createUser failed: ${createError?.message}`)

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { heartbeatIntervalMs: 0 },
  })
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({ email, password })
  if (signInError || !session.session) throw new Error(`signIn failed: ${signInError?.message}`)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    realtime: { heartbeatIntervalMs: 0 },
  })

  return {
    id: created.user.id,
    email,
    accessToken: session.session.access_token,
    client: userClient,
  }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient()
  await admin.auth.admin.deleteUser(userId)
}
