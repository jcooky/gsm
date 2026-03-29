import { assertEquals, assertRejects } from "@std/assert"
import { createTestUser, deleteTestUser, type TestUser } from "../helpers.ts"
import { KnowledgeGraphManager } from "../../_shared/graph-manager.ts"

// ---------------------------------------------------------------------------
// Test lifecycle helpers
// ---------------------------------------------------------------------------

function manager(user: TestUser): KnowledgeGraphManager {
  return new KnowledgeGraphManager(user.client, user.id)
}

async function withUser(
  label: string,
  fn: (user: TestUser, mgr: KnowledgeGraphManager) => Promise<void>,
): Promise<void> {
  const user = await createTestUser(label)
  try {
    await fn(user, manager(user))
  } finally {
    await deleteTestUser(user.id)
  }
}

// ---------------------------------------------------------------------------
// Entity CRUD
// ---------------------------------------------------------------------------

Deno.test("createEntities — creates new entities with observations", async () => {
  await withUser("create-entities", async (_, mgr) => {
    const created = await mgr.createEntities([
      { name: "Alice", entityType: "person", observations: ["likes coffee", "works at Acme"] },
      { name: "Acme", entityType: "organization", observations: ["founded in 2000"] },
    ])

    assertEquals(created.length, 2)
    assertEquals(created[0].name, "Alice")
    assertEquals(created[0].observations.length, 2)

    const graph = await mgr.readGraph()
    assertEquals(graph.entities.length, 2)
    const alice = graph.entities.find((e) => e.name === "Alice")!
    assertEquals(alice.observations, ["likes coffee", "works at Acme"])
  })
})

Deno.test("createEntities — ignores duplicate entity names (idempotent)", async () => {
  await withUser("create-dup", async (_, mgr) => {
    await mgr.createEntities([{ name: "Bob", entityType: "person", observations: [] }])
    const second = await mgr.createEntities([{ name: "Bob", entityType: "person", observations: [] }])

    assertEquals(second.length, 0, "duplicate should be ignored")

    const graph = await mgr.readGraph()
    assertEquals(graph.entities.length, 1)
  })
})

Deno.test("deleteEntities — removes entity and cascades its relations", async () => {
  await withUser("delete-cascade", async (_, mgr) => {
    await mgr.createEntities([
      { name: "X", entityType: "node", observations: [] },
      { name: "Y", entityType: "node", observations: [] },
    ])
    await mgr.createRelations([{ from: "X", to: "Y", relationType: "links_to" }])

    await mgr.deleteEntities(["X"])

    const graph = await mgr.readGraph()
    assertEquals(graph.entities.length, 1)
    assertEquals(graph.entities[0].name, "Y")
    assertEquals(graph.relations.length, 0, "relation should be cascade-deleted")
  })
})

// ---------------------------------------------------------------------------
// Relation CRUD
// ---------------------------------------------------------------------------

Deno.test("createRelations — creates relation between existing entities", async () => {
  await withUser("create-rel", async (_, mgr) => {
    await mgr.createEntities([
      { name: "Dennis", entityType: "person", observations: [] },
      { name: "GSM", entityType: "project", observations: [] },
    ])
    const created = await mgr.createRelations([{ from: "Dennis", to: "GSM", relationType: "owns" }])

    assertEquals(created.length, 1)
    assertEquals(created[0].relationType, "owns")

    const graph = await mgr.readGraph()
    assertEquals(graph.relations.length, 1)
  })
})

Deno.test("createRelations — skips relation when entity does not exist", async () => {
  await withUser("create-rel-missing", async (_, mgr) => {
    await mgr.createEntities([{ name: "OnlyOne", entityType: "node", observations: [] }])
    const created = await mgr.createRelations([{ from: "OnlyOne", to: "Ghost", relationType: "points_to" }])

    assertEquals(created.length, 0)
  })
})

Deno.test("createRelations — ignores duplicate relations (idempotent)", async () => {
  await withUser("create-rel-dup", async (_, mgr) => {
    await mgr.createEntities([
      { name: "A", entityType: "node", observations: [] },
      { name: "B", entityType: "node", observations: [] },
    ])
    await mgr.createRelations([{ from: "A", to: "B", relationType: "connected" }])
    await mgr.createRelations([{ from: "A", to: "B", relationType: "connected" }])

    const graph = await mgr.readGraph()
    assertEquals(graph.relations.length, 1)
  })
})

Deno.test("deleteRelations — removes only the specified relation", async () => {
  await withUser("delete-rel", async (_, mgr) => {
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
    assertEquals(graph.relations.length, 1)
    assertEquals(graph.relations[0].relationType, "rel_b")
  })
})

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

Deno.test("addObservations — adds new observations, skips duplicates", async () => {
  await withUser("add-obs", async (_, mgr) => {
    await mgr.createEntities([{ name: "Eve", entityType: "person", observations: ["loves jazz"] }])

    const results = await mgr.addObservations([{
      entityName: "Eve",
      contents: ["loves jazz", "plays guitar"],
    }])

    assertEquals(results[0].addedObservations, ["plays guitar"])

    const graph = await mgr.readGraph()
    const eve = graph.entities.find((e) => e.name === "Eve")!
    assertEquals(eve.observations.length, 2)
  })
})

Deno.test("addObservations — throws when entity does not exist", async () => {
  await withUser("add-obs-missing", async (_, mgr) => {
    await assertRejects(
      () => mgr.addObservations([{ entityName: "Ghost", contents: ["hello"] }]),
      Error,
      "not found",
    )
  })
})

Deno.test("deleteObservations — removes only specified observations", async () => {
  await withUser("delete-obs", async (_, mgr) => {
    await mgr.createEntities([{
      name: "Fred",
      entityType: "person",
      observations: ["fact one", "fact two", "fact three"],
    }])

    await mgr.deleteObservations([{ entityName: "Fred", observations: ["fact two"] }])

    const graph = await mgr.readGraph()
    const fred = graph.entities.find((e) => e.name === "Fred")!
    assertEquals(fred.observations.sort(), ["fact one", "fact three"])
  })
})

// ---------------------------------------------------------------------------
// Read / Search
// ---------------------------------------------------------------------------

Deno.test("readGraph — returns all entities and relations", async () => {
  await withUser("read-graph", async (_, mgr) => {
    await mgr.createEntities([
      { name: "Node1", entityType: "thing", observations: ["obs"] },
      { name: "Node2", entityType: "thing", observations: [] },
    ])
    await mgr.createRelations([{ from: "Node1", to: "Node2", relationType: "edge" }])

    const graph = await mgr.readGraph()
    assertEquals(graph.entities.length, 2)
    assertEquals(graph.relations.length, 1)
  })
})

Deno.test("searchNodes — finds by entity name", async () => {
  await withUser("search-name", async (_, mgr) => {
    await mgr.createEntities([
      { name: "TypeScript", entityType: "language", observations: [] },
      { name: "Python", entityType: "language", observations: [] },
    ])

    const result = await mgr.searchNodes("python")
    assertEquals(result.entities.length, 1)
    assertEquals(result.entities[0].name, "Python")
  })
})

Deno.test("searchNodes — finds by entity type", async () => {
  await withUser("search-type", async (_, mgr) => {
    await mgr.createEntities([
      { name: "Alice", entityType: "person", observations: [] },
      { name: "Acme Corp", entityType: "organization", observations: [] },
    ])

    const result = await mgr.searchNodes("organization")
    assertEquals(result.entities.length, 1)
    assertEquals(result.entities[0].name, "Acme Corp")
  })
})

Deno.test("searchNodes — finds by observation content", async () => {
  await withUser("search-obs", async (_, mgr) => {
    await mgr.createEntities([
      { name: "Alice", entityType: "person", observations: ["speaks Korean", "likes hiking"] },
      { name: "Bob", entityType: "person", observations: ["speaks English"] },
    ])

    const result = await mgr.searchNodes("korean")
    assertEquals(result.entities.length, 1)
    assertEquals(result.entities[0].name, "Alice")
  })
})

Deno.test("searchNodes — returns connected relations", async () => {
  await withUser("search-rels", async (_, mgr) => {
    await mgr.createEntities([
      { name: "Foo", entityType: "node", observations: ["target"] },
      { name: "Bar", entityType: "node", observations: [] },
    ])
    await mgr.createRelations([{ from: "Foo", to: "Bar", relationType: "connects" }])

    const result = await mgr.searchNodes("target")
    assertEquals(result.relations.length, 1)
  })
})

Deno.test("openNodes — returns specified entities and their relations", async () => {
  await withUser("open-nodes", async (_, mgr) => {
    await mgr.createEntities([
      { name: "Alpha", entityType: "node", observations: [] },
      { name: "Beta", entityType: "node", observations: [] },
      { name: "Gamma", entityType: "node", observations: [] },
    ])
    await mgr.createRelations([{ from: "Alpha", to: "Beta", relationType: "link" }])

    const result = await mgr.openNodes(["Alpha", "Beta"])
    assertEquals(result.entities.length, 2)
    assertEquals(result.relations.length, 1)
  })
})

// ---------------------------------------------------------------------------
// Namespace isolation (RLS)
// ---------------------------------------------------------------------------

Deno.test("RLS — user cannot read another user's entities", async () => {
  const userA = await createTestUser("rls-a")
  const userB = await createTestUser("rls-b")
  try {
    const mgrA = manager(userA)
    await mgrA.createEntities([{ name: "SecretA", entityType: "secret", observations: [] }])

    const mgrB = manager(userB)
    const graph = await mgrB.readGraph()
    assertEquals(graph.entities.length, 0, "User B must not see User A's data")
  } finally {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  }
})

Deno.test("RLS — user cannot delete another user's entities", async () => {
  const userA = await createTestUser("rls-del-a")
  const userB = await createTestUser("rls-del-b")
  try {
    const mgrA = manager(userA)
    await mgrA.createEntities([{ name: "PrivateA", entityType: "thing", observations: [] }])

    const mgrB = manager(userB)
    await mgrB.deleteEntities(["PrivateA"])

    const graph = await mgrA.readGraph()
    assertEquals(graph.entities.length, 1, "User A's entity must still exist")
  } finally {
    await deleteTestUser(userA.id)
    await deleteTestUser(userB.id)
  }
})

Deno.test("namespace — auto-created on first request", async () => {
  const user = await createTestUser("ns-autocreate")
  try {
    const mgr = manager(user)
    await mgr.readGraph()

    const { data } = await user.client.from("namespaces").select("id").eq("user_id", user.id)
    assertEquals(data?.length, 1, "namespace should exist after first request")
  } finally {
    await deleteTestUser(user.id)
  }
})
