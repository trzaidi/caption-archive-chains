-- Week 8: prompt chain tool.
-- Run once in the Supabase SQL editor of the project shared with design-gen-ai and
-- caption-archive-admin, AFTER caption-archive-admin/sql/004_week7_observability.sql.
-- Extends the Week 7 prompt_chains / prompt_chain_steps / llm_models tables instead of
-- replacing them, so the rating app's response log and the admin panel keep working.
BEGIN;

-- 1. Schema additions ---------------------------------------------------------
ALTER TABLE public.prompt_chains
  ADD COLUMN IF NOT EXISTS input_type text NOT NULL DEFAULT 'text' CHECK (input_type IN ('image','text','none'));
ALTER TABLE public.prompt_chain_steps
  ADD COLUMN IF NOT EXISTS output_type text NOT NULL DEFAULT 'text' CHECK (output_type IN ('text','image')),
  ADD COLUMN IF NOT EXISTS attach_input_image boolean NOT NULL DEFAULT false;
ALTER TABLE public.llm_models
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'text' CHECK (modality IN ('text','image')),
  ADD COLUMN IF NOT EXISTS accepts_images boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.llm_models.modality IS 'text: language model. image: image generation model.';
COMMENT ON COLUMN public.llm_models.accepts_images IS 'Whether the model can read an input image (vision).';
UPDATE public.llm_models SET accepts_images = true WHERE model_identifier LIKE 'google/gemini%';

-- Reordering swaps step_order values inside one statement, so uniqueness is checked at commit.
ALTER TABLE public.prompt_chain_steps DROP CONSTRAINT IF EXISTS prompt_chain_steps_prompt_chain_id_step_order_key;
ALTER TABLE public.prompt_chain_steps ADD CONSTRAINT prompt_chain_steps_prompt_chain_id_step_order_key
  UNIQUE (prompt_chain_id, step_order) DEFERRABLE INITIALLY DEFERRED;

-- 2. Chains and steps become editable by superadmins -------------------------
GRANT INSERT, UPDATE, DELETE ON public.prompt_chains, public.prompt_chain_steps TO authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prompt_chains','prompt_chain_steps'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "archive_admin_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "archive_admin_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "archive_admin_delete_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "archive_admin_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_archive_superadmin()))', t, t);
    EXECUTE format('CREATE POLICY "archive_admin_update_%s" ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_archive_superadmin())) WITH CHECK ((SELECT public.is_archive_superadmin()))', t, t);
    EXECUTE format('CREATE POLICY "archive_admin_delete_%s" ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_archive_superadmin()))', t, t);
  END LOOP;
END $$;

-- New steps go to the end unless a position is given.
CREATE OR REPLACE FUNCTION private.place_chain_step()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.step_order IS NULL THEN
    SELECT COALESCE(MAX(step_order), 0) + 1 INTO NEW.step_order FROM public.prompt_chain_steps WHERE prompt_chain_id = NEW.prompt_chain_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.place_chain_step() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS place_chain_step ON public.prompt_chain_steps;
CREATE TRIGGER place_chain_step BEFORE INSERT ON public.prompt_chain_steps FOR EACH ROW EXECUTE FUNCTION private.place_chain_step();

-- Deleting a step closes the gap, so steps are always numbered 1..n.
CREATE OR REPLACE FUNCTION private.compact_chain_steps()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.prompt_chains WHERE id = OLD.prompt_chain_id) THEN
    UPDATE public.prompt_chain_steps s SET step_order = r.rn
    FROM (SELECT id, row_number() OVER (ORDER BY step_order) AS rn FROM public.prompt_chain_steps WHERE prompt_chain_id = OLD.prompt_chain_id) r
    WHERE s.id = r.id AND s.step_order <> r.rn;
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.compact_chain_steps() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS compact_chain_steps ON public.prompt_chain_steps;
CREATE TRIGGER compact_chain_steps AFTER DELETE ON public.prompt_chain_steps FOR EACH ROW EXECUTE FUNCTION private.compact_chain_steps();

-- Atomic reorder: pass every step id of the chain in its new order, plus each step's
-- prompt with {{step_N}} references already rewritten to follow the moved steps.
CREATE OR REPLACE FUNCTION public.reorder_prompt_chain_steps(p_chain_id bigint, p_step_ids bigint[], p_instructions text[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE total integer;
BEGIN
  IF NOT (SELECT public.is_archive_superadmin()) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO total FROM public.prompt_chain_steps WHERE prompt_chain_id = p_chain_id;
  IF total = 0 OR total <> COALESCE(array_length(p_step_ids, 1), 0)
     OR total <> COALESCE(array_length(p_instructions, 1), 0)
     OR (SELECT count(DISTINCT s) FROM unnest(p_step_ids) s) <> total
     OR EXISTS (SELECT 1 FROM unnest(p_step_ids) s WHERE NOT EXISTS (
          SELECT 1 FROM public.prompt_chain_steps st WHERE st.id = s AND st.prompt_chain_id = p_chain_id)) THEN
    RAISE EXCEPTION 'The step list does not match the chain' USING ERRCODE = '22023';
  END IF;
  UPDATE public.prompt_chain_steps st SET step_order = o.ord, instructions = p_instructions[o.ord]
  FROM unnest(p_step_ids) WITH ORDINALITY AS o(id, ord)
  WHERE st.id = o.id AND st.prompt_chain_id = p_chain_id
    AND (st.step_order <> o.ord OR st.instructions IS DISTINCT FROM p_instructions[o.ord]);
END $$;
REVOKE ALL ON FUNCTION public.reorder_prompt_chain_steps(bigint, bigint[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_prompt_chain_steps(bigint, bigint[], text[]) TO authenticated;

-- 3. Runs: every generation made by the tool, step by step --------------------
CREATE TABLE IF NOT EXISTS public.prompt_chain_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prompt_chain_id bigint NOT NULL REFERENCES public.prompt_chains(id) ON DELETE CASCADE,
  chain_name text NOT NULL,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  input_text text CHECK (input_text IS NULL OR char_length(input_text) <= 8000),
  input_image_path text,
  error text CHECK (error IS NULL OR char_length(error) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS prompt_chain_runs_chain_idx ON public.prompt_chain_runs(prompt_chain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prompt_chain_runs_user_idx ON public.prompt_chain_runs(started_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.prompt_chain_run_steps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES public.prompt_chain_runs(id) ON DELETE CASCADE,
  prompt_chain_step_id bigint REFERENCES public.prompt_chain_steps(id) ON DELETE SET NULL,
  step_order integer NOT NULL,
  title text NOT NULL,
  model text,
  output_type text NOT NULL CHECK (output_type IN ('text','image')),
  prompt_sent text NOT NULL,
  output_text text,
  output_image_path text,
  status text NOT NULL CHECK (status IN ('succeeded','failed','skipped')),
  error text CHECK (error IS NULL OR char_length(error) <= 1000),
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prompt_chain_run_steps_run_idx ON public.prompt_chain_run_steps(run_id, step_order);

ALTER TABLE public.prompt_chain_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_chain_run_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prompt_chain_runs, public.prompt_chain_run_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_chain_runs, public.prompt_chain_run_steps TO authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prompt_chain_runs','prompt_chain_run_steps'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "archive_admin_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "archive_admin_all_%s" ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_archive_superadmin())) WITH CHECK ((SELECT public.is_archive_superadmin()))', t, t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS audit_archive_config ON public.prompt_chain_runs;
CREATE TRIGGER audit_archive_config AFTER INSERT OR DELETE ON public.prompt_chain_runs FOR EACH ROW EXECUTE FUNCTION private.audit_archive_config();

-- 4. Private storage for run inputs and generated images ---------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chain-media', 'chain-media', false, 8388608, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS chain_media_admin_select ON storage.objects;
CREATE POLICY chain_media_admin_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chain-media' AND (SELECT public.is_archive_superadmin()));
DROP POLICY IF EXISTS chain_media_admin_insert ON storage.objects;
CREATE POLICY chain_media_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chain-media' AND (SELECT public.is_archive_superadmin()));
DROP POLICY IF EXISTS chain_media_admin_update ON storage.objects;
CREATE POLICY chain_media_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chain-media' AND (SELECT public.is_archive_superadmin()))
  WITH CHECK (bucket_id = 'chain-media' AND (SELECT public.is_archive_superadmin()));
DROP POLICY IF EXISTS chain_media_admin_delete ON storage.objects;
CREATE POLICY chain_media_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chain-media' AND (SELECT public.is_archive_superadmin()));

-- 5. Models verified on this team's AI Gateway on 2026-11-06 ------------------
INSERT INTO public.llm_models(provider_id, name, model_identifier, max_output_tokens, modality, accepts_images)
SELECT p.id, m.name, m.ident, m.max_tokens, m.modality, m.vision
FROM (VALUES
  ('Gemini 2.5 Flash-Lite', 'google/gemini-2.5-flash-lite', 1500, 'text', true),
  ('Gemini 2.5 Flash',      'google/gemini-2.5-flash',      2000, 'text', true),
  ('GPT-5 Mini',            'openai/gpt-5-mini',            4000, 'text', true),
  ('GPT-5 Nano',            'openai/gpt-5-nano',            4000, 'text', true),
  ('Recraft v4.1 Flash',    'recraft/recraft-v4.1-flash',   NULL, 'image', false),
  ('Seedream 4.0',          'bytedance/seedream-4.0',       NULL, 'image', true),
  ('GPT Image 1 Mini',      'openai/gpt-image-1-mini',      NULL, 'image', true)
) AS m(name, ident, max_tokens, modality, vision)
JOIN public.llm_providers p ON p.name = 'Vercel AI Gateway'
ON CONFLICT (provider_id, model_identifier) DO NOTHING;

-- 6. Example chain from the assignment brief ---------------------------------
DO $$
DECLARE chain bigint; flash bigint; img bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.prompt_chains WHERE name = 'Picture to five captions') THEN
    SELECT id INTO flash FROM public.llm_models WHERE model_identifier = 'google/gemini-2.5-flash-lite' ORDER BY id LIMIT 1;
    SELECT id INTO img FROM public.llm_models WHERE model_identifier = 'recraft/recraft-v4.1-flash' ORDER BY id LIMIT 1;
    INSERT INTO public.prompt_chains(name, description, input_type, is_active)
    VALUES ('Picture to five captions', 'Describe a picture, find the joke in it, write five short captions, then render a poster for the best one.', 'image', true)
    RETURNING id INTO chain;
    INSERT INTO public.prompt_chain_steps(prompt_chain_id, step_order, title, llm_model_id, output_type, attach_input_image, instructions) VALUES
      (chain, 1, 'Describe the picture', flash, 'text', true,
       'Describe this image in two or three plain sentences. Mention the setting, the main subject, and anything odd or surprising. Output only the description.'),
      (chain, 2, 'Find the joke', flash, 'text', false,
       E'Here is a description of a picture:\n\n{{previous}}\n\nWrite one funny observation about it, in the voice of a chronically online Columbia student. Two sentences maximum. Output only the observation.'),
      (chain, 3, 'Write five captions', flash, 'text', false,
       E'Picture description:\n{{step_1}}\n\nFunny angle:\n{{step_2}}\n\nWrite five short, funny meme captions for this picture, each under 12 words. Number them 1 to 5 and output nothing else.'),
      (chain, 4, 'Poster for the best caption', img, 'image', false,
       E'A bold, clean meme poster illustration. Scene: {{step_1}}\nPrint the first caption from this list in large white impact-style letters at the bottom: {{step_3}}');
  END IF;
END $$;

COMMIT;
