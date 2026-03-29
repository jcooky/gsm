import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticate, AuthError } from "@/lib/auth"
import { KnowledgeGraphManager } from "@/lib/graph-manager"
import { buildMcpServer } from "@/lib/mcp-server"
import { getResourceUrl, getWwwAuthenticateHeader } from "@/lib/oauth-metadata"

function unauthorized(req: Request, message: string): Response {
  const resourceUrl = getResourceUrl(req)
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": getWwwAuthenticateHeader(resourceUrl),
      },
    }
  )
}

export async function POST(req: Request) {
  let auth
  try {
    auth = await authenticate(req)
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(req, err.message)
    throw err
  }

  const manager = new KnowledgeGraphManager(auth.supabase, auth.userId)
  const server = buildMcpServer(manager)
  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)

  const response = await transport.handleRequest(req)
  req.signal.addEventListener("abort", () => {
    transport.close()
    server.close()
  })
  return response
}

export async function GET(req: Request) {
  return unauthorized(req, "Authentication required")
}

export async function DELETE() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  })
}
