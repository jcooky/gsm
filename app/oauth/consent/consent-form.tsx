"use client"

import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { useState } from "react"

export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDecision = async (approve: boolean) => {
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowser()

    const result = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    window.location.href = result.data.redirect_url
  }

  return (
    <>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => handleDecision(false)}
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          Deny
        </button>
        <button
          onClick={() => handleDecision(true)}
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Authorizing..." : "Approve"}
        </button>
      </div>
    </>
  )
}
