-- namespaces: one per auth user, auto-created on first MCP request
CREATE TABLE public.namespaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- entities: knowledge graph nodes
CREATE TABLE public.entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id  UUID NOT NULL REFERENCES public.namespaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (namespace_id, name)
);

-- observations: facts attached to an entity
CREATE TABLE public.observations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- relations: directed edges between entities
CREATE TABLE public.relations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id   UUID NOT NULL REFERENCES public.namespaces(id) ON DELETE CASCADE,
  from_entity    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity      UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relation_type  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (namespace_id, from_entity, to_entity, relation_type)
);

-- Indexes
CREATE INDEX idx_entities_namespace ON public.entities (namespace_id);
CREATE INDEX idx_observations_entity ON public.observations (entity_id);
CREATE INDEX idx_relations_namespace ON public.relations (namespace_id);
CREATE INDEX idx_relations_from ON public.relations (from_entity);
CREATE INDEX idx_relations_to ON public.relations (to_entity);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_namespaces_updated_at
  BEFORE UPDATE ON public.namespaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Row Level Security
ALTER TABLE public.namespaces  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relations   ENABLE ROW LEVEL SECURITY;

CREATE POLICY namespaces_owner ON public.namespaces
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY entities_owner ON public.entities
  FOR ALL USING (
    namespace_id IN (SELECT id FROM public.namespaces WHERE user_id = auth.uid())
  );

CREATE POLICY observations_owner ON public.observations
  FOR ALL USING (
    entity_id IN (
      SELECT e.id FROM public.entities e
      JOIN public.namespaces n ON e.namespace_id = n.id
      WHERE n.user_id = auth.uid()
    )
  );

CREATE POLICY relations_owner ON public.relations
  FOR ALL USING (
    namespace_id IN (SELECT id FROM public.namespaces WHERE user_id = auth.uid())
  );
