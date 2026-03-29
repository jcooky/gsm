import { describe, it, expect, afterAll } from "vitest"
import { createTestUser, deleteTestUser, HEALTH_URL, MCP_URL, type TestUser } from "../helpers"

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

function parseSse(text: string): unknown {
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"))
  return JSON.parse(dataLine ? dataLine.slice(5).trim() : text)
}

async function mcpCall(toolName: string, args: Record<string, unknown>, user: TestUser) {
  const res = await mcpRequest("tools/call", { name: toolName, arguments: args }, user)
  return parseSse(await res.text()) as { result: { content: { text: string }[] } }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns {status: ok}", async () => {
    const res = await fetch(HEALTH_URL)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe("POST /mcp without auth", () => {
  it("returns 401", async () => {
    const res = await mcpRequest("tools/list", {})
    expect(res.status).toBe(401)
    await res.body?.cancel()
  })
})

// ---------------------------------------------------------------------------
// MCP Protocol
// ---------------------------------------------------------------------------

describe("tools/list", () => {
  it("returns all 9 memory tools", async () => {
    const user = await createTestUser("e2e-list")
    try {
      const res = await mcpRequest("tools/list", {}, user)
      expect(res.status).toBe(200)
      const body = parseSse(await res.text()) as { result: { tools: { name: string }[] } }
      const names = body.result.tools.map((t) => t.name)
      const expected = [
        "create_entities", "create_relations", "add_observations",
        "delete_entities", "delete_observations", "delete_relations",
        "read_graph", "search_nodes", "open_nodes",
      ]
      expect(names).toHaveLength(9)
      for (const name of expected) expect(names).toContain(name)
    } finally {
      await deleteTestUser(user.id)
    }
  })
})

describe("round-trip: create_entities → read_graph", () => {
  it("creates entities and reads them back", async () => {
    const user = await createTestUser("e2e-rt")
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
      const result = await mcpCall("read_graph", {}, user)
      const graph = JSON.parse(result.result.content[0].text)
      expect(graph.entities).toHaveLength(2)
      expect(graph.relations).toHaveLength(1)
      expect(graph.relations[0].relationType).toBe("owns")
    } finally {
      await deleteTestUser(user.id)
    }
  })
})

describe("search_nodes", () => {
  it("returns matching entities via MCP", async () => {
    const user = await createTestUser("e2e-search")
    try {
      await mcpCall("create_entities", {
        entities: [
          { name: "Cursor", entityType: "tool", observations: ["AI-powered IDE"] },
          { name: "Vim", entityType: "tool", observations: ["classic editor"] },
        ],
      }, user)
      const result = await mcpCall("search_nodes", { query: "AI-powered" }, user)
      const graph = JSON.parse(result.result.content[0].text)
      expect(graph.entities).toHaveLength(1)
      expect(graph.entities[0].name).toBe("Cursor")
    } finally {
      await deleteTestUser(user.id)
    }
  })
})

// ---------------------------------------------------------------------------
// Compatibility — response format matches original memory server
// ---------------------------------------------------------------------------

describe("response format", () => {
  it("entities have name/entityType/observations fields", async () => {
    const user = await createTestUser("e2e-compat")
    try {
      await mcpCall("create_entities", {
        entities: [{ name: "TestEntity", entityType: "test", observations: ["obs1"] }],
      }, user)
      const result = await mcpCall("read_graph", {}, user)
      const { entities } = JSON.parse(result.result.content[0].text)
      expect(entities[0]).toMatchObject({
        name: expect.any(String),
        entityType: expect.any(String),
        observations: expect.any(Array),
      })
    } finally {
      await deleteTestUser(user.id)
    }
  })

  it("relations have from/to/relationType fields", async () => {
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
      const result = await mcpCall("read_graph", {}, user)
      const { relations } = JSON.parse(result.result.content[0].text)
      expect(relations[0]).toMatchObject({
        from: expect.any(String),
        to: expect.any(String),
        relationType: expect.any(String),
      })
    } finally {
      await deleteTestUser(user.id)
    }
  })
})
