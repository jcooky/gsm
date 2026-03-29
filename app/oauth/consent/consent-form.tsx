"use client"

import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { useState } from "react"

export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const handleDecision = async (approve: boolean) => {
    setState("loading")
    setError(null)

    const supabase = createSupabaseBrowser()
    const result = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)

    if (result.error) {
      setError(result.error.message)
      setState("idle")
      return
    }

    // Redirect to client (e.g. cursor://) — browser stays on page for custom schemes
    window.location.href = result.data.redirect_url

    // Show completion UI after a short delay in case browser doesn't navigate
    setTimeout(() => setState(approve ? "done" : "denied"), 500)
  }

  if (state === "done") {
    return (
      <div className="text-center space-y-3">
        <div className="text-emerald-400 text-3xl">✓</div>
        <p className="text-neutral-300 font-medium">Authorization complete</p>
        <p className="text-neutral-500 text-sm">You can now return to Cursor (or whichever app requested access).</p>
      </div>
    )
  }

  if (state === "denied") {
    return (
      <div className="text-center space-y-3">
        <div className="text-neutral-400 text-3xl">✕</div>
        <p className="text-neutral-300 font-medium">Access denied</p>
        <p className="text-neutral-500 text-sm">You can close this tab and return to your app.</p>
      </div>
    )
  }

  return (
    <>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => handleDecision(false)}
          disabled={state === "loading"}
          className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          Deny
        </button>
        <button
          onClick={() => handleDecision(true)}
          disabled={state === "loading"}
          className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {state === "loading" ? "Authorizing…" : "Approve"}
        </button>
      </div>
    </>
  )
}
