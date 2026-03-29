import { createSupabaseServer } from "@/lib/supabase-server"
import Link from "next/link"

export default async function Home() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold tracking-tight mb-4">GSM</h1>
      <p className="text-xl text-neutral-400 mb-8 text-center max-w-lg">
        Global Shared Memory — your AI remembers the same things, everywhere.
      </p>
      <code className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-300 mb-8">
        {`{ "url": "https://gsm-mu.vercel.app/mcp" }`}
      </code>

      {user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-neutral-400">
            Signed in as <span className="text-neutral-100 font-medium">{user.email ?? user.user_metadata?.user_name ?? user.id}</span>
          </p>
          <div className="flex gap-4 text-sm">
            <Link href="/migrate" className="text-neutral-400 hover:text-neutral-100 transition-colors">
              Migrate memory
            </Link>
            <Link
              href="/logout"
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Sign out
            </Link>
          </div>
        </div>
      ) : (
        <Link
          href="/login"
          className="bg-neutral-100 text-neutral-900 font-medium px-6 py-3 rounded-lg hover:bg-white transition-colors"
        >
          Sign in with GitHub
        </Link>
      )}
    </main>
  )
}
