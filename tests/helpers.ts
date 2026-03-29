import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321"
export const SUPABASE_ANON_KEY =
  process.env.SB_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SB_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

export const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:54321/functions/v1/mcp"
export const HEALTH_URL = process.env.HEALTH_URL ?? "http://127.0.0.1:54321/functions/v1/health"

export interface TestUser {
  id: string
  email: string
  accessToken: string
  client: SupabaseClient
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
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

  const { data: session, error: signInError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.signInWithPassword({ email, password })
  if (signInError || !session.session) throw new Error(`signIn failed: ${signInError?.message}`)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  })

  return {
    id: created.user.id,
    email,
    accessToken: session.session.access_token,
    client: userClient,
  }
}

export async function deleteTestUser(userId: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(userId)
}
