import type { Entity, KnowledgeGraph, Relation } from "./types"

export interface ParseResult {
  graph: KnowledgeGraph
  format: "jsonl" | "json"
  errors: string[]
}

export function parseMemoryFile(content: string): ParseResult {
  const trimmed = content.trim()
  const errors: string[] = []

  // Auto-detect: JSONL starts with a line containing {"type":
  const isJsonl = trimmed.startsWith("{")

  if (isJsonl) {
    return parseJsonl(trimmed, errors)
  } else {
    return parseJson(trimmed, errors)
  }
}

function parseJsonl(content: string, errors: string[]): ParseResult {
  const entities: Entity[] = []
  const relations: Relation[] = []
  const lines = content.split("\n").filter((l) => l.trim())

  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i])
      if (obj.type === "entity") {
        const entity = validateEntity(obj, i + 1, errors)
        if (entity) entities.push(entity)
      } else if (obj.type === "relation") {
        const relation = validateRelation(obj, i + 1, errors)
        if (relation) relations.push(relation)
      } else {
        errors.push(`Line ${i + 1}: unknown type "${obj.type}"`)
      }
    } catch {
      errors.push(`Line ${i + 1}: invalid JSON`)
    }
  }

  return { graph: { entities, relations }, format: "jsonl", errors }
}

function parseJson(content: string, errors: string[]): ParseResult {
  try {
    const obj = JSON.parse(content)
    const entities: Entity[] = []
    const relations: Relation[] = []

    if (!Array.isArray(obj.entities)) {
      errors.push('Missing "entities" array')
    } else {
      obj.entities.forEach((e: unknown, i: number) => {
        const entity = validateEntity(e, i + 1, errors)
        if (entity) entities.push(entity)
      })
    }

    if (!Array.isArray(obj.relations)) {
      errors.push('Missing "relations" array')
    } else {
      obj.relations.forEach((r: unknown, i: number) => {
        const relation = validateRelation(r, i + 1, errors)
        if (relation) relations.push(relation)
      })
    }

    return { graph: { entities, relations }, format: "json", errors }
  } catch {
    errors.push("Invalid JSON format")
    return { graph: { entities: [], relations: [] }, format: "json", errors }
  }
}

function validateEntity(obj: unknown, line: number, errors: string[]): Entity | null {
  if (typeof obj !== "object" || obj === null) {
    errors.push(`Entity ${line}: not an object`)
    return null
  }
  const e = obj as Record<string, unknown>
  if (typeof e.name !== "string" || !e.name) {
    errors.push(`Entity ${line}: missing "name"`)
    return null
  }
  if (typeof e.entityType !== "string" || !e.entityType) {
    errors.push(`Entity ${line}: missing "entityType"`)
    return null
  }
  const observations = Array.isArray(e.observations)
    ? (e.observations as unknown[]).filter((o): o is string => typeof o === "string")
    : []

  return { name: e.name, entityType: e.entityType, observations }
}

function validateRelation(obj: unknown, line: number, errors: string[]): Relation | null {
  if (typeof obj !== "object" || obj === null) {
    errors.push(`Relation ${line}: not an object`)
    return null
  }
  const r = obj as Record<string, unknown>
  if (typeof r.from !== "string") { errors.push(`Relation ${line}: missing "from"`); return null }
  if (typeof r.to !== "string") { errors.push(`Relation ${line}: missing "to"`); return null }
  if (typeof r.relationType !== "string") { errors.push(`Relation ${line}: missing "relationType"`); return null }
  return { from: r.from, to: r.to, relationType: r.relationType }
}

export function graphToJsonl(graph: KnowledgeGraph): string {
  const lines = [
    ...graph.entities.map((e) =>
      JSON.stringify({ type: "entity", name: e.name, entityType: e.entityType, observations: e.observations })
    ),
    ...graph.relations.map((r) =>
      JSON.stringify({ type: "relation", from: r.from, to: r.to, relationType: r.relationType })
    ),
  ]
  return lines.join("\n")
}

export function graphToJson(graph: KnowledgeGraph): string {
  return JSON.stringify(
    {
      entities: graph.entities,
      relations: graph.relations,
    },
    null,
    2
  )
}
