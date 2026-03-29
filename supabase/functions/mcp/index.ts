import "@supabase/functions-js/edge-runtime.d.ts"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Hono } from "hono"
import { z } from "zod"
import { authenticate, AuthError } from "../_shared/auth.ts"
import { KnowledgeGraphManager } from "../_shared/graph-manager.ts"

const EntitySchema = z.object({
  name: z.string(),
  entityType: z.string(),
  observations: z.array(z.string()),
})

const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  relationType: z.string(),
})

function buildMcpServer(manager: KnowledgeGraphManager): McpServer {
  const server = new McpServer({ name: "gsm", version: "0.1.0" })

  server.registerTool("create_entities", {
    description: "Create multiple new entities in the knowledge graph",
    inputSchema: z.object({ entities: z.array(EntitySchema) }),
  }, async ({ entities }) => {
    const result = await manager.createEntities(entities)
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
  })

  server.registerTool("create_relations", {
    description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
    inputSchema: z.object({ relations: z.array(RelationSchema) }),
  }, async ({ relations }) => {
    const result = await manager.createRelations(relations)
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
  })

  server.registerTool("add_observations", {
    description: "Add new observations to existing entities in the knowledge graph",
    inputSchema: z.object({
      observations: z.array(z.object({
        entityName: z.string(),
        contents: z.array(z.string()),
      })),
    }),
  }, async ({ observations }) => {
    const result = await manager.addObservations(observations)
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
  })

  server.registerTool("delete_entities", {
    description: "Delete multiple entities and their associated relations from the knowledge graph",
    inputSchema: z.object({ entityNames: z.array(z.string()) }),
  }, async ({ entityNames }) => {
    await manager.deleteEntities(entityNames)
    return { content: [{ type: "text", text: "Entities deleted successfully" }] }
  })

  server.registerTool("delete_observations", {
    description: "Delete specific observations from entities in the knowledge graph",
    inputSchema: z.object({
      deletions: z.array(z.object({
        entityName: z.string(),
        observations: z.array(z.string()),
      })),
    }),
  }, async ({ deletions }) => {
    await manager.deleteObservations(deletions)
    return { content: [{ type: "text", text: "Observations deleted successfully" }] }
  })

  server.registerTool("delete_relations", {
    description: "Delete multiple relations from the knowledge graph",
    inputSchema: z.object({ relations: z.array(RelationSchema) }),
  }, async ({ relations }) => {
    await manager.deleteRelations(relations)
    return { content: [{ type: "text", text: "Relations deleted successfully" }] }
  })

  server.registerTool("read_graph", {
    description: "Read the entire knowledge graph",
    inputSchema: z.object({}),
  }, async () => {
    const graph = await manager.readGraph()
    return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] }
  })

  server.registerTool("search_nodes", {
    description: "Search for nodes in the knowledge graph based on a query",
    inputSchema: z.object({ query: z.string() }),
  }, async ({ query }) => {
    const graph = await manager.searchNodes(query)
    return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] }
  })

  server.registerTool("open_nodes", {
    description: "Open specific nodes in the knowledge graph by their names",
    inputSchema: z.object({ names: z.array(z.string()) }),
  }, async ({ names }) => {
    const graph = await manager.openNodes(names)
    return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] }
  })

  return server
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const AUTH_SERVER = `${SUPABASE_URL}/auth/v1`
const RESOURCE_URL = `${SUPABASE_URL}/functions/v1/mcp`

// WWW-Authenticate header per MCP OAuth spec (RFC 9728 + MCP 2025-06-18)
const WWW_AUTHENTICATE =
  `Bearer realm="${RESOURCE_URL}", ` +
  `authorization_uri="${AUTH_SERVER}/oauth/authorize", ` +
  `registration_uri="${AUTH_SERVER}/oauth/clients/register", ` +
  `resource_metadata="${SUPABASE_URL}/.well-known/oauth-protected-resource"`

const app = new Hono().basePath("/mcp")

// Protected Resource Metadata endpoint (RFC 9728) — lets MCP clients discover the OAuth server
app.get("/.well-known/oauth-protected-resource", (c) => {
  return c.json({
    resource: RESOURCE_URL,
    authorization_servers: [AUTH_SERVER],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/jcooky/gsm",
  })
})

app.post("/", async (c) => {
  let auth
  try {
    auth = await authenticate(c.req.raw)
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: err.message }, id: null }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": WWW_AUTHENTICATE,
          },
        }
      )
    }
    throw err
  }

  const manager = new KnowledgeGraphManager(auth.supabase, auth.userId)
  const server = buildMcpServer(manager)
  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)

  const response = await transport.handleRequest(c.req.raw)
  c.req.raw.signal.addEventListener("abort", () => {
    transport.close()
    server.close()
  })
  return response
})

// SSE fallback: return 401 with WWW-Authenticate so Cursor knows OAuth is required
app.get("/", (c) => {
  return new Response(
    JSON.stringify({ error: "Authentication required" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": WWW_AUTHENTICATE,
      },
    }
  )
})

app.delete("/", (c) => c.json({ error: "Method not allowed" }, 405))

Deno.serve(app.fetch)
