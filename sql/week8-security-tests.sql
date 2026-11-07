-- Week 8 permission and behavior checks. Every change rolls back.
-- Run in the Supabase SQL editor; success is "Success. No rows returned".
BEGIN;

-- Anonymous visitors cannot see chains or runs.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM 1 FROM public.prompt_chains; RAISE EXCEPTION 'Anon can read chains';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.prompt_chain_runs; RAISE EXCEPTION 'Anon can read runs';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- A signed-in member who is not a superadmin sees and changes nothing.
-- Uses any existing non-admin profile; the owner admin is picked the same way below.
SELECT set_config('test.member', (SELECT p.id::text FROM public.profiles p WHERE p.is_superadmin IS NOT TRUE ORDER BY p.updated_at LIMIT 1), true);
SELECT set_config('test.admin', (SELECT p.id::text FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.is_superadmin AND u.raw_app_meta_data->>'provider' = 'google' ORDER BY p.updated_at LIMIT 1), true);
DO $$ BEGIN
  IF current_setting('test.member', true) IS NULL OR current_setting('test.member', true) = '' THEN RAISE EXCEPTION 'No non-admin profile to test with'; END IF;
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.member'), 'role', 'authenticated', 'app_metadata', json_build_object('provider', 'google'))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  IF public.is_archive_superadmin() THEN RAISE EXCEPTION 'Member has admin access'; END IF;
  SELECT count(*) INTO n FROM public.prompt_chains; IF n <> 0 THEN RAISE EXCEPTION 'Member can read chains'; END IF;
  SELECT count(*) INTO n FROM public.prompt_chain_steps; IF n <> 0 THEN RAISE EXCEPTION 'Member can read steps'; END IF;
  SELECT count(*) INTO n FROM public.prompt_chain_runs; IF n <> 0 THEN RAISE EXCEPTION 'Member can read runs'; END IF;
  BEGIN INSERT INTO public.prompt_chains(name) VALUES ('member chain'); RAISE EXCEPTION 'Member can create chains';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.prompt_chain_steps SET title = 'x'; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'Member can edit steps'; END IF;
  DELETE FROM public.prompt_chains; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'Member can delete chains'; END IF;
  BEGIN PERFORM public.reorder_prompt_chain_steps(1, ARRAY[1]::bigint[], ARRAY['x']); RAISE EXCEPTION 'Member can reorder';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO storage.objects(bucket_id, name) VALUES ('chain-media', 'runs/0/x.png'); RAISE EXCEPTION 'Member can upload chain media';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- A superadmin can create, edit, reorder, delete and run chains.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'), 'role', 'authenticated', 'app_metadata', json_build_object('provider', 'google'))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE chain bigint; s1 bigint; s2 bigint; s3 bigint; run bigint; n integer; orders text; audit_before integer;
BEGIN
  IF NOT public.is_archive_superadmin() THEN RAISE EXCEPTION 'Owner admin missing'; END IF;
  SELECT count(*) INTO n FROM public.prompt_chain_steps; IF n < 9 THEN RAISE EXCEPTION 'Week 7 steps missing'; END IF;
  SELECT count(*) INTO audit_before FROM public.admin_audit_log;

  INSERT INTO public.prompt_chains(name, input_type) VALUES ('Rollback test chain', 'text') RETURNING id INTO chain;
  IF NOT EXISTS (SELECT 1 FROM public.prompt_chain_mix WHERE prompt_chain_id = chain) THEN RAISE EXCEPTION 'Mix row not created'; END IF;
  -- step_order is filled in when omitted
  INSERT INTO public.prompt_chain_steps(prompt_chain_id, title, instructions) VALUES (chain, 'A', 'first {{input}}') RETURNING id INTO s1;
  INSERT INTO public.prompt_chain_steps(prompt_chain_id, title, instructions) VALUES (chain, 'B', 'second {{step_1}}') RETURNING id INTO s2;
  INSERT INTO public.prompt_chain_steps(prompt_chain_id, title, instructions, output_type) VALUES (chain, 'C', 'third', 'image') RETURNING id INTO s3;
  SELECT string_agg(title || step_order, ',' ORDER BY step_order) INTO orders FROM public.prompt_chain_steps WHERE prompt_chain_id = chain;
  IF orders <> 'A1,B2,C3' THEN RAISE EXCEPTION 'Append order wrong: %', orders; END IF;

  UPDATE public.prompt_chain_steps SET title = 'A edited' WHERE id = s1; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Admin cannot edit steps'; END IF;
  UPDATE public.prompt_chain_steps SET title = 'A' WHERE id = s1;

  -- Move C to the top; B's reference to A is rewritten by the caller and saved atomically.
  PERFORM public.reorder_prompt_chain_steps(chain, ARRAY[s3, s1, s2], ARRAY['third', 'first {{input}}', 'second {{step_2}}']);
  SELECT string_agg(title || step_order, ',' ORDER BY step_order) INTO orders FROM public.prompt_chain_steps WHERE prompt_chain_id = chain;
  IF orders <> 'C1,A2,B3' THEN RAISE EXCEPTION 'Reorder wrong: %', orders; END IF;
  IF (SELECT instructions FROM public.prompt_chain_steps WHERE id = s2) <> 'second {{step_2}}' THEN RAISE EXCEPTION 'Reference not saved with reorder'; END IF;

  BEGIN PERFORM public.reorder_prompt_chain_steps(chain, ARRAY[s3, s1], ARRAY['a', 'b']); RAISE EXCEPTION 'Partial reorder accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.reorder_prompt_chain_steps(chain, ARRAY[s3, s1, 1], ARRAY['a', 'b', 'c']); RAISE EXCEPTION 'Foreign step accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- Deleting the first step closes the gap.
  DELETE FROM public.prompt_chain_steps WHERE id = s3;
  SELECT string_agg(title || step_order, ',' ORDER BY step_order) INTO orders FROM public.prompt_chain_steps WHERE prompt_chain_id = chain;
  IF orders <> 'A1,B2' THEN RAISE EXCEPTION 'Compaction wrong: %', orders; END IF;

  INSERT INTO public.prompt_chain_runs(prompt_chain_id, chain_name, started_by, input_text) VALUES (chain, 'Rollback test chain', auth.uid(), 'hi') RETURNING id INTO run;
  INSERT INTO public.prompt_chain_run_steps(run_id, prompt_chain_step_id, step_order, title, output_type, prompt_sent, status)
  VALUES (run, s1, 1, 'A', 'text', 'first hi', 'succeeded');
  INSERT INTO storage.objects(bucket_id, name) VALUES ('chain-media', 'runs/' || run || '/test.png');

  IF (SELECT count(*) FROM public.admin_audit_log) <= audit_before THEN RAISE EXCEPTION 'Changes were not audited'; END IF;

  DELETE FROM public.prompt_chains WHERE id = chain;
  IF EXISTS (SELECT 1 FROM public.prompt_chain_steps WHERE prompt_chain_id = chain) THEN RAISE EXCEPTION 'Steps not removed with chain'; END IF;
  IF EXISTS (SELECT 1 FROM public.prompt_chain_runs WHERE id = run) THEN RAISE EXCEPTION 'Runs not removed with chain'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
