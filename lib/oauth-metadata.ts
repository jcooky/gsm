const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const authServer = `${supabaseUrl}/auth/v1`

export function getResourceUrl(req: Request): string {
  const url = new URL(req.url)
  return `${url.origin}/mcp`
}

export function getPrmResponse(resourceUrl: string) {
  return {
    resource: resourceUrl,
    authorization_servers: [authServer],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/jcooky/gsm",
  }
}

export function getWwwAuthenticateHeader(resourceUrl: string): string {
  return [
    `Bearer realm="${resourceUrl}"`,
    `resource_metadata="${resourceUrl}/.well-known/oauth-protected-resource"`,
  ].join(", ")
}
