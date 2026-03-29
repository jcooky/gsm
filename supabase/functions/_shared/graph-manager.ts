import { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { Entity, KnowledgeGraph, Relation } from "./types.ts"

export class KnowledgeGraphManager {
  constructor(private supabase: SupabaseClient, private userId: string) {}

  async ensureNamespace(): Promise<string> {
    const { data, error } = await this.supabase
      .from("namespaces")
      .upsert({ user_id: this.userId }, { onConflict: "user_id" })
      .select("id")
      .single()

    if (error) throw new Error(`Failed to ensure namespace: ${error.message}`)
    return data.id
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const namespaceId = await this.ensureNamespace()

    const newEntities: Entity[] = []
    for (const entity of entities) {
      const { data: existing } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", entity.name)
        .maybeSingle()

      if (existing) continue

      const { data: created, error } = await this.supabase
        .from("entities")
        .insert({ namespace_id: namespaceId, name: entity.name, entity_type: entity.entityType })
        .select("id")
        .single()

      if (error) throw new Error(`Failed to create entity: ${error.message}`)

      if (entity.observations.length > 0) {
        await this.supabase
          .from("observations")
          .insert(entity.observations.map((content) => ({ entity_id: created.id, content })))
      }

      newEntities.push(entity)
    }

    return newEntities
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const namespaceId = await this.ensureNamespace()
    const newRelations: Relation[] = []

    for (const rel of relations) {
      const { data: fromEntity } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", rel.from)
        .maybeSingle()

      const { data: toEntity } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", rel.to)
        .maybeSingle()

      if (!fromEntity || !toEntity) continue

      const { error } = await this.supabase
        .from("relations")
        .upsert({
          namespace_id: namespaceId,
          from_entity: fromEntity.id,
          to_entity: toEntity.id,
          relation_type: rel.relationType,
        }, { onConflict: "namespace_id,from_entity,to_entity,relation_type", ignoreDuplicates: true })

      if (error) throw new Error(`Failed to create relation: ${error.message}`)
      newRelations.push(rel)
    }

    return newRelations
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const namespaceId = await this.ensureNamespace()
    const results = []

    for (const obs of observations) {
      const { data: entity, error: entityError } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", obs.entityName)
        .maybeSingle()

      if (entityError || !entity) {
        throw new Error(`Entity with name ${obs.entityName} not found`)
      }

      const { data: existing } = await this.supabase
        .from("observations")
        .select("content")
        .eq("entity_id", entity.id)

      const existingContents = new Set((existing ?? []).map((o) => o.content))
      const newContents = obs.contents.filter((c) => !existingContents.has(c))

      if (newContents.length > 0) {
        await this.supabase
          .from("observations")
          .insert(newContents.map((content) => ({ entity_id: entity.id, content })))
      }

      results.push({ entityName: obs.entityName, addedObservations: newContents })
    }

    return results
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const namespaceId = await this.ensureNamespace()
    await this.supabase
      .from("entities")
      .delete()
      .eq("namespace_id", namespaceId)
      .in("name", entityNames)
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
  ): Promise<void> {
    const namespaceId = await this.ensureNamespace()

    for (const d of deletions) {
      const { data: entity } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", d.entityName)
        .maybeSingle()

      if (!entity) continue

      await this.supabase
        .from("observations")
        .delete()
        .eq("entity_id", entity.id)
        .in("content", d.observations)
    }
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const namespaceId = await this.ensureNamespace()

    for (const rel of relations) {
      const { data: fromEntity } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", rel.from)
        .maybeSingle()

      const { data: toEntity } = await this.supabase
        .from("entities")
        .select("id")
        .eq("namespace_id", namespaceId)
        .eq("name", rel.to)
        .maybeSingle()

      if (!fromEntity || !toEntity) continue

      await this.supabase
        .from("relations")
        .delete()
        .eq("namespace_id", namespaceId)
        .eq("from_entity", fromEntity.id)
        .eq("to_entity", toEntity.id)
        .eq("relation_type", rel.relationType)
    }
  }

  async readGraph(): Promise<KnowledgeGraph> {
    const namespaceId = await this.ensureNamespace()
    return this.buildGraph(namespaceId)
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const namespaceId = await this.ensureNamespace()

    const { data: entities, error } = await this.supabase
      .rpc("search_entities", {
        p_namespace_id: namespaceId,
        p_query: query,
      })
      .select("id, name, entity_type")

    if (error) throw new Error(`Search failed: ${error.message}`)

    if (!entities || entities.length === 0) {
      return { entities: [], relations: [] }
    }

    const entityIds = entities.map((e) => e.id)

    const { data: withObs } = await this.supabase
      .from("entities")
      .select("id, name, entity_type, observations(content)")
      .in("id", entityIds)

    return this.entitiesToGraph(withObs ?? [], namespaceId)
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const namespaceId = await this.ensureNamespace()

    const { data: entities } = await this.supabase
      .from("entities")
      .select("id, name, entity_type, observations(content)")
      .eq("namespace_id", namespaceId)
      .in("name", names)

    return this.entitiesToGraph(entities ?? [], namespaceId)
  }

  private async buildGraph(namespaceId: string): Promise<KnowledgeGraph> {
    const { data: entities } = await this.supabase
      .from("entities")
      .select("id, name, entity_type, observations(content)")
      .eq("namespace_id", namespaceId)

    return this.entitiesToGraph(entities ?? [], namespaceId)
  }

  private async entitiesToGraph(
    entities: { id: string; name: string; entity_type: string; observations: { content: string }[] }[],
    namespaceId: string,
  ): Promise<KnowledgeGraph> {
    const entityIds = entities.map((e) => e.id)
    const entityIdToName = new Map(entities.map((e) => [e.id, e.name]))

    const { data: relations } = entityIds.length > 0
      ? await this.supabase
        .from("relations")
        .select("from_entity, to_entity, relation_type")
        .eq("namespace_id", namespaceId)
        .or(`from_entity.in.(${entityIds.join(",")}),to_entity.in.(${entityIds.join(",")})`)
      : { data: [] }

    return {
      entities: entities.map((e) => ({
        name: e.name,
        entityType: e.entity_type,
        observations: e.observations.map((o) => o.content),
      })),
      relations: (relations ?? []).map((r) => ({
        from: entityIdToName.get(r.from_entity) ?? r.from_entity,
        to: entityIdToName.get(r.to_entity) ?? r.to_entity,
        relationType: r.relation_type,
      })),
    }
  }
}
