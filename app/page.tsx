export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold tracking-tight mb-4">GSM</h1>
      <p className="text-xl text-neutral-400 mb-8 text-center max-w-lg">
        Global Shared Memory — your AI remembers the same things, everywhere.
      </p>
      <code className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-300">
        {`{ "url": "https://agqjbmbtzdvxrqpycuwl.supabase.co/functions/v1/mcp" }`}
      </code>
    </main>
  )
}
