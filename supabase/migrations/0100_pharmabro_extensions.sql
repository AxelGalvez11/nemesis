-- PharmaBro fork bootstrap (NOT from Ascend — added for portability).
--
-- Ascend's Layer-A migrations (0105/0107) reference the schema-qualified type
-- `extensions.vector`, which only resolves on Ascend's hosted Supabase where pgvector
-- is pre-installed into the `extensions` schema. A fresh PharmaBro project (and the
-- local CLI stack) places `CREATE EXTENSION vector` in `public` instead, so 0105 fails
-- with "type extensions.vector does not exist".
--
-- Fix: install pgvector into `extensions` BEFORE 0101 runs. 0101's unqualified
-- `CREATE EXTENSION IF NOT EXISTS vector` then becomes a no-op, and every
-- `extensions.vector` reference resolves. See IMPLEMENTATION_PLAN.md §6.

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'vector';

  IF ext_schema IS NULL THEN
    EXECUTE 'CREATE EXTENSION vector WITH SCHEMA extensions';
  ELSIF ext_schema <> 'extensions' THEN
    -- pgvector is relocatable; move it so qualified references resolve.
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
  END IF;
END $$;
