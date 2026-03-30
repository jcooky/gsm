import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticate, AuthError } from "@/lib/auth"
import { KnowledgeGraphManager } from "@/lib/graph-manager"
import { buildMcpServer } from "@/lib/mcp-server"
import { getResourceUrl, getWwwAuthenticateHeader } from "@/lib/oauth-metadata"

function unauthorized(req: Request, err: AuthError): Response {
  const resourceUrl = getResourceUrl(req)

  // Token expired → tell client to refresh (error="invalid_token")
  // so Cursor uses its stored refresh_token silently instead of opening browser
  if (err.isExpired) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: err.message }, id: null }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer error="invalid_token", error_description="${err.message}"`,
        },
      }
    )
  }

  // No token or invalid signature → full re-auth via OAuth discovery
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: err.message }, id: null }),
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
    if (err instanceof AuthError) return unauthorized(req, err)
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
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Authentication required" }, id: null }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": getWwwAuthenticateHeader(getResourceUrl(req)),
      },
    }
  )
}

export async function DELETE() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  })
}
