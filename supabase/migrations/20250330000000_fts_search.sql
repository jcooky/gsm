-- 1. entities 테이블에 FTS 컬럼 추가 (name + entity_type)
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce(name, '') || ' ' || coalesce(entity_type, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_entities_fts ON public.entities USING GIN (fts);

-- 2. observations 테이블에 FTS 컬럼 추가
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(content, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_observations_fts ON public.observations USING GIN (fts);

-- 3. FTS 통합 검색 함수
--    entity name/type + observations 를 한 번의 DB 쿼리로 검색
CREATE OR REPLACE FUNCTION public.search_entities(
  p_namespace_id uuid,
  p_query text
)
RETURNS TABLE (
  id            uuid,
  namespace_id  uuid,
  name          text,
  entity_type   text,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT DISTINCT e.id, e.namespace_id, e.name, e.entity_type, e.created_at, e.updated_at
  FROM public.entities e
  LEFT JOIN public.observations o ON o.entity_id = e.id
  WHERE e.namespace_id = p_namespace_id
    AND (
      e.fts @@ websearch_to_tsquery('english', p_query)
      OR o.fts @@ websearch_to_tsquery('english', p_query)
    )
$$;
