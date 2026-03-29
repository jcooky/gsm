import { describe, it, expect, afterEach } from "vitest"
import { KnowledgeGraphManager } from "../../lib/graph-manager"
import { createTestUser, deleteTestUser, type TestUser } from "../helpers"

function manager(user: TestUser) {
  return new KnowledgeGraphManager(user.client, user.id)
}

async function withUser(
  fn: (user: TestUser, mgr: KnowledgeGraphManager) => Promise<void>
): Promise<void> {
  const user = await createTestUser(`int-${Date.now()}`)
  try {
    await fn(user, manager(user))
  } finally {
    await deleteTestUser(user.id)
  }
}

// ---------------------------------------------------------------------------
// Entity CRUD
// ---------------------------------------------------------------------------

describe("createEntities", () => {
  it("creates new entities with observations", async () => {
    await withUser(async (_, mgr) => {
      const created = await mgr.createEntities([
        { name: "Alice", entityType: "person", observations: ["likes coffee", "works at Acme"] },
        { name: "Acme", entityType: "organization", observations: ["founded in 2000"] },
      ])
      expect(created).toHaveLength(2)
      const graph = await mgr.readGraph()
      expect(graph.entities).toHaveLength(2)
      const alice = graph.entities.find((e) => e.name === "Alice")!
      expect(alice.observations).toEqual(["likes coffee", "works at Acme"])
    })
  })

  it("ignores duplicate entity names (idempotent)", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([{ name: "Bob", entityType: "person", observations: [] }])
      const second = await mgr.createEntities([{ name: "Bob", entityType: "person", observations: [] }])
      expect(second).toHaveLength(0)
      expect((await mgr.readGraph()).entities).toHaveLength(1)
    })
  })
})

describe("deleteEntities", () => {
  it("removes entity and cascades its relations", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "X", entityType: "node", observations: [] },
        { name: "Y", entityType: "node", observations: [] },
      ])
      await mgr.createRelations([{ from: "X", to: "Y", relationType: "links_to" }])
      await mgr.deleteEntities(["X"])
      const graph = await mgr.readGraph()
      expect(graph.entities).toHaveLength(1)
      expect(graph.entities[0].name).toBe("Y")
      expect(graph.relations).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Relation CRUD
// ---------------------------------------------------------------------------

describe("createRelations", () => {
  it("creates relation between existing entities", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "Dennis", entityType: "person", observations: [] },
        { name: "GSM", entityType: "project", observations: [] },
      ])
      const created = await mgr.createRelations([{ from: "Dennis", to: "GSM", relationType: "owns" }])
      expect(created).toHaveLength(1)
      expect((await mgr.readGraph()).relations).toHaveLength(1)
    })
  })

  it("skips relation when entity does not exist", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([{ name: "OnlyOne", entityType: "node", observations: [] }])
      const created = await mgr.createRelations([{ from: "OnlyOne", to: "Ghost", relationType: "points_to" }])
      expect(created).toHaveLength(0)
    })
  })

  it("ignores duplicate relations (idempotent)", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "A", entityType: "node", observations: [] },
        { name: "B", entityType: "node", observations: [] },
      ])
      await mgr.createRelations([{ from: "A", to: "B", relationType: "connected" }])
      await mgr.createRelations([{ from: "A", to: "B", relationType: "connected" }])
      expect((await mgr.readGraph()).relations).toHaveLength(1)
    })
  })
})

describe("deleteRelations", () => {
  it("removes only the specified relation", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "P", entityType: "node", observations: [] },
        { name: "Q", entityType: "node", observations: [] },
      ])
      await mgr.createRelations([
        { from: "P", to: "Q", relationType: "rel_a" },
        { from: "P", to: "Q", relationType: "rel_b" },
      ])
      await mgr.deleteRelations([{ from: "P", to: "Q", relationType: "rel_a" }])
      const graph = await mgr.readGraph()
      expect(graph.relations).toHaveLength(1)
      expect(graph.relations[0].relationType).toBe("rel_b")
    })
  })
})

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

describe("addObservations", () => {
  it("adds new observations, skips duplicates", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([{ name: "Eve", entityType: "person", observations: ["loves jazz"] }])
      const results = await mgr.addObservations([{ entityName: "Eve", contents: ["loves jazz", "plays guitar"] }])
      expect(results[0].addedObservations).toEqual(["plays guitar"])
      const eve = (await mgr.readGraph()).entities.find((e) => e.name === "Eve")!
      expect(eve.observations).toHaveLength(2)
    })
  })

  it("throws when entity does not exist", async () => {
    await withUser(async (_, mgr) => {
      await expect(
        mgr.addObservations([{ entityName: "Ghost", contents: ["hello"] }])
      ).rejects.toThrow("not found")
    })
  })
})

describe("deleteObservations", () => {
  it("removes only specified observations", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([{
        name: "Fred",
        entityType: "person",
        observations: ["fact one", "fact two", "fact three"],
      }])
      await mgr.deleteObservations([{ entityName: "Fred", observations: ["fact two"] }])
      const fred = (await mgr.readGraph()).entities.find((e) => e.name === "Fred")!
      expect(fred.observations.sort()).toEqual(["fact one", "fact three"])
    })
  })
})

// ---------------------------------------------------------------------------
// Read / Search
// ---------------------------------------------------------------------------

describe("readGraph", () => {
  it("returns all entities and relations", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "Node1", entityType: "thing", observations: ["obs"] },
        { name: "Node2", entityType: "thing", observations: [] },
      ])
      await mgr.createRelations([{ from: "Node1", to: "Node2", relationType: "edge" }])
      const graph = await mgr.readGraph()
      expect(graph.entities).toHaveLength(2)
      expect(graph.relations).toHaveLength(1)
    })
  })
})

describe("searchNodes", () => {
  it("finds by entity name", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "TypeScript", entityType: "language", observations: [] },
        { name: "Python", entityType: "language", observations: [] },
      ])
      const result = await mgr.searchNodes("python")
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0].name).toBe("Python")
    })
  })

  it("finds by entity type", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "Alice", entityType: "person", observations: [] },
        { name: "Acme Corp", entityType: "organization", observations: [] },
      ])
      const result = await mgr.searchNodes("organization")
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0].name).toBe("Acme Corp")
    })
  })

  it("finds by observation content", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "Alice", entityType: "person", observations: ["speaks Korean", "likes hiking"] },
        { name: "Bob", entityType: "person", observations: ["speaks English"] },
      ])
      const result = await mgr.searchNodes("korean")
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0].name).toBe("Alice")
    })
  })

  it("returns connected relations", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "Foo", entityType: "node", observations: ["target"] },
        { name: "Bar", entityType: "node", observations: [] },
      ])
      await mgr.createRelations([{ from: "Foo", to: "Bar", relationType: "connects" }])
      const result = await mgr.searchNodes("target")
      expect(result.relations).toHaveLength(1)
    })
  })
})

describe("openNodes", () => {
  it("returns specified entities and their relations", async () => {
    await withUser(async (_, mgr) => {
      await mgr.createEntities([
        { name: "Alpha", entityType: "node", observations: [] },
        { name: "Beta", entityType: "node", observations: [] },
        { name: "Gamma", entityType: "node", observations: [] },
      ])
      await mgr.createRelations([{ from: "Alpha", to: "Beta", relationType: "link" }])
      const result = await mgr.openNodes(["Alpha", "Beta"])
      expect(result.entities).toHaveLength(2)
      expect(result.relations).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Namespace isolation (RLS)
// ---------------------------------------------------------------------------

describe("RLS", () => {
  it("user cannot read another user's entities", async () => {
    const userA = await createTestUser("rls-a")
    const userB = await createTestUser("rls-b")
    try {
      await manager(userA).createEntities([{ name: "SecretA", entityType: "secret", observations: [] }])
      const graph = await manager(userB).readGraph()
      expect(graph.entities).toHaveLength(0)
    } finally {
      await deleteTestUser(userA.id)
      await deleteTestUser(userB.id)
    }
  })

  it("user cannot delete another user's entities", async () => {
    const userA = await createTestUser("rls-del-a")
    const userB = await createTestUser("rls-del-b")
    try {
      await manager(userA).createEntities([{ name: "PrivateA", entityType: "thing", observations: [] }])
      await manager(userB).deleteEntities(["PrivateA"])
      const graph = await manager(userA).readGraph()
      expect(graph.entities).toHaveLength(1)
    } finally {
      await deleteTestUser(userA.id)
      await deleteTestUser(userB.id)
    }
  })

  it("namespace auto-created on first request", async () => {
    const user = await createTestUser("ns-auto")
    try {
      await manager(user).readGraph()
      const { data } = await user.client.from("namespaces").select("id").eq("user_id", user.id)
      expect(data).toHaveLength(1)
    } finally {
      await deleteTestUser(user.id)
    }
  })
})
