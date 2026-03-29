import { createSupabaseServer } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { ConsentForm } from "./consent-form"

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>
}) {
  const { authorization_id } = await searchParams

  if (!authorization_id) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-red-400">Error: Missing authorization_id</p>
      </main>
    )
  }

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/oauth/consent?authorization_id=${authorization_id}`)
  }

  const { data: authDetails, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorization_id)

  if (error || !authDetails) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-red-400">Error: {error?.message ?? "Invalid authorization request"}</p>
      </main>
    )
  }

  if ("redirect_url" in authDetails) {
    redirect(authDetails.redirect_url)
  }

  const details = authDetails

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-1">Authorize access</h1>
        <p className="text-neutral-400 text-sm mb-6">
          <span className="text-neutral-100 font-medium">{details.client.name}</span>{" "}
          wants to access your GSM knowledge graph.
        </p>

        <div className="space-y-3 mb-6 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Client</span>
            <span>{details.client.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Redirect</span>
            <span className="truncate ml-4 max-w-[240px]">{details.redirect_uri}</span>
          </div>
          {details.scope?.trim() && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Scopes</span>
              <span>{details.scope}</span>
            </div>
          )}
        </div>

        <ConsentForm authorizationId={authorization_id} />
      </div>
    </main>
  )
}
