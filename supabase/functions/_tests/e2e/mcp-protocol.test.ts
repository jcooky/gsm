import { assertEquals, assertExists } from "@std/assert"
import { createTestUser, deleteTestUser, HEALTH_URL, MCP_URL, type TestUser } from "../helpers.ts"

// ---------------------------------------------------------------------------
// Deno.test wrapper — disables leak detection (Supabase client uses intervals)
// ---------------------------------------------------------------------------

function test(name: string, fn: () => Promise<void>): void {
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false })
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

async function mcpRequest(
  method: string,
  params: Record<string, unknown>,
  user?: TestUser,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  }
  if (user) headers["Authorization"] = `Bearer ${user.accessToken}`

  return fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
}

function parseSseResponse(text: string): unknown {
  // SSE format: "event: message\ndata: {...}\n\n"
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"))
  if (dataLine) return JSON.parse(dataLine.slice(5).trim())
  return JSON.parse(text)
}

async function mcpCall(
  toolName: string,
  args: Record<string, unknown>,
  user: TestUser,
): Promise<unknown> {
  const res = await mcpRequest("tools/call", { name: toolName, arguments: args }, user)
  return parseSseResponse(await res.text())
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

test("GET /health — returns {status: ok}", async () => {
  const res = await fetch(HEALTH_URL)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.status, "ok")
})

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test("POST /mcp without auth — returns 401", async () => {
  const res = await mcpRequest("tools/list", {})
  assertEquals(res.status, 401)
  await res.body?.cancel()
})

// ---------------------------------------------------------------------------
// MCP Protocol — tools/list
// ---------------------------------------------------------------------------

test("tools/list — returns all 9 memory tools", async () => {
  const user = await createTestUser("e2e-list")
  try {
    const res = await mcpRequest("tools/list", {}, user)
    assertEquals(res.status, 200)

    const body = parseSseResponse(await res.text()) as { result: { tools: { name: string }[] } }
    const toolNames = body.result.tools.map((t) => t.name)
    const expected = [
      "create_entities",
      "create_relations",
      "add_observations",
      "delete_entities",
      "delete_observations",
      "delete_relations",
      "read_graph",
      "search_nodes",
      "open_nodes",
    ]
    for (const name of expected) {
      assertEquals(toolNames.includes(name), true, `missing tool: ${name}`)
    }
    assertEquals(toolNames.length, 9)
  } finally {
    await deleteTestUser(user.id)
  }
})

// ---------------------------------------------------------------------------
// MCP Protocol — full round-trip
// ---------------------------------------------------------------------------

test("create_entities → read_graph — round-trip through MCP", async () => {
  const user = await createTestUser("e2e-roundtrip")
  try {
    await mcpCall("create_entities", {
      entities: [
        { name: "Dennis", entityType: "person", observations: ["working on GSM"] },
        { name: "GSM", entityType: "project", observations: [] },
      ],
    }, user)

    await mcpCall("create_relations", {
      relations: [{ from: "Dennis", to: "GSM", relationType: "owns" }],
    }, user)

    const result = await mcpCall("read_graph", {}, user) as {
      result: { content: { text: string }[] }
    }
    const graph = JSON.parse(result.result.content[0].text)

    assertEquals(graph.entities.length, 2)
    assertEquals(graph.relations.length, 1)
    assertEquals(graph.relations[0].relationType, "owns")
  } finally {
    await deleteTestUser(user.id)
  }
})

test("search_nodes — returns matching entities via MCP", async () => {
  const user = await createTestUser("e2e-search")
  try {
    await mcpCall("create_entities", {
      entities: [
        { name: "Cursor", entityType: "tool", observations: ["AI-powered IDE"] },
        { name: "Vim", entityType: "tool", observations: ["classic editor"] },
      ],
    }, user)

    const result = await mcpCall("search_nodes", { query: "AI-powered" }, user) as {
      result: { content: { text: string }[] }
    }
    const graph = JSON.parse(result.result.content[0].text)

    assertEquals(graph.entities.length, 1)
    assertEquals(graph.entities[0].name, "Cursor")
  } finally {
    await deleteTestUser(user.id)
  }
})

// ---------------------------------------------------------------------------
// Compatibility — response format matches original memory server
// ---------------------------------------------------------------------------

test("response format — entities have name/entityType/observations fields", async () => {
  const user = await createTestUser("e2e-compat")
  try {
    await mcpCall("create_entities", {
      entities: [{ name: "TestEntity", entityType: "test", observations: ["obs1"] }],
    }, user)

    const result = await mcpCall("read_graph", {}, user) as {
      result: { content: { text: string }[] }
    }
    const graph = JSON.parse(result.result.content[0].text)
    const entity = graph.entities[0]

    assertExists(entity.name)
    assertExists(entity.entityType)
    assertExists(entity.observations)
    assertEquals(Array.isArray(entity.observations), true)
  } finally {
    await deleteTestUser(user.id)
  }
})

test("response format — relations have from/to/relationType fields", async () => {
  const user = await createTestUser("e2e-compat-rel")
  try {
    await mcpCall("create_entities", {
      entities: [
        { name: "A", entityType: "node", observations: [] },
        { name: "B", entityType: "node", observations: [] },
      ],
    }, user)
    await mcpCall("create_relations", {
      relations: [{ from: "A", to: "B", relationType: "links" }],
    }, user)

    const result = await mcpCall("read_graph", {}, user) as {
      result: { content: { text: string }[] }
    }
    const graph = JSON.parse(result.result.content[0].text)
    const rel = graph.relations[0]

    assertExists(rel.from)
    assertExists(rel.to)
    assertExists(rel.relationType)
  } finally {
    await deleteTestUser(user.id)
  }
})
