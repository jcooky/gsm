import { createClient, SupabaseClient } from "@supabase/supabase-js"

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321"
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0"
export const MCP_URL = Deno.env.get("MCP_URL") ?? "http://127.0.0.1:54321/functions/v1/mcp"
export const HEALTH_URL = Deno.env.get("HEALTH_URL") ?? "http://127.0.0.1:54321/functions/v1/health"

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
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

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({ email, password })
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
  const admin = adminClient()
  await admin.auth.admin.deleteUser(userId)
}
