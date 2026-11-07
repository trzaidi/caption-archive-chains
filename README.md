# Caption Archive · Prompt Chains

Week 8 prompt chain tool for the Caption Archive. A separate Next.js app, restricted to Google-authenticated `profiles.is_superadmin = true` accounts, for building multi-step prompt chains and generating media with them. It shares the Supabase project used by the rating app (`design-gen-ai`) and the admin panel (`caption-archive-admin`).

## What it does

| Requirement | Where |
| --- | --- |
| Superadmin-only access | Request proxy, every page and server action, the run endpoint, and row-level security |
| Create, update, delete prompt chains | Chains list → New chain; chain page → Chain details; delete asks you to type the chain name |
| Create, update, delete steps | Chain page: add step, click a step to edit, trash icon to delete |
| Reorder steps | Drag the handle, or use the up/down buttons (keyboard accessible) |
| Generate media with a chain | Run panel on the chain page: upload an image or enter text, watch each step stream in |
| View media produced by a chain | Chain → Generated media: the tool's test runs, plus captions the rating app published through that chain |
| Dark, light and system themes | Switch in the sidebar and on the sign-in page; applied before first paint |

### Beyond the brief

- **Steps reference each other.** `{{input}}`, `{{previous}}` and `{{step_N}}` are inserted from chips under the prompt and checked as you type. When you reorder or delete, `{{step_N}}` references are rewritten so they keep pointing at the same step. A move that would leave a step pointing forward is refused with an explanation.
- **Text and image steps.** Text steps can see the uploaded picture (vision). Image steps generate a picture, optionally using the upload as a reference.
- **Live streaming runs.** Each step's output appears as it finishes, then the full trace is saved: exact prompt sent, output, model, tokens and duration.
- **Model registry.** Model pickers read the Week 7 `llm_models` table. Week 8 adds a modality column and seven models verified on this team's AI Gateway.
- **Duplicate, export and import** chains as JSON.
- **Rate limit:** 20 runs per superadmin per hour, shown in the run panel, to protect the shared AI Gateway balance.
- **Private media:** inputs and generated images live in a private `chain-media` bucket and are shown through one-hour signed links.
- **Audit trail:** chain, step and run changes are written to `admin_audit_log` in the same transaction, so they appear in the admin panel.

## Schema

`sql/001_week8_prompt_chain_tool.sql` extends the Week 7 tables rather than replacing them. It has been applied to the shared project.

- `prompt_chains` gains `input_type` (image, text or none). Superadmins can now insert, update and delete.
- `prompt_chain_steps` gains `output_type` and `attach_input_image`. The `(prompt_chain_id, step_order)` unique constraint is now deferrable, so `reorder_prompt_chain_steps()` can save a new order and rewritten prompts in one statement. Triggers append new steps and close gaps after a delete.
- `llm_models` gains `modality` and `accepts_images`.
- New `prompt_chain_runs` and `prompt_chain_run_steps` record each run. Both are superadmin-only.
- New private storage bucket `chain-media`, superadmin-only.
- Seeds the brief's example as **Picture to five captions**: describe the picture, find the joke, write five captions, render a poster.

The three Week 7 tone chains document the rating app's live pipeline. Captions the rating app publishes are logged against them, so they show up under that chain's media. Editing those chains here changes the documented chain and test runs, not the rating app's prompt. Steps without a model ("No model call") are skipped in runs and pass the previous output through. The rating app's `{scene}`, `{tone}` and `{context}` placeholders are filled when they run here.

## Models

Runs go through the Vercel AI Gateway. Deployed functions authenticate with Vercel OIDC, so no key is stored. Locally, `vercel env pull` writes a short-lived `VERCEL_OIDC_TOKEN`.

The team is on the Gateway free tier, which blocks some models. Verified working on November 6, 2026:

| Text | Image |
| --- | --- |
| Gemini 2.5 Flash-Lite, Gemini 2.5 Flash, GPT-5 Mini, GPT-5 Nano | Recraft v4.1 Flash, Seedream 4.0, GPT Image 1 Mini |

The Week 7 tone chains use Gemini 3.5 Flash-Lite, which the free Gateway tier blocks. Set a `GEMINI_API_KEY` secret on this Vercel project to run models registered under the Google Gemini provider directly, as the rating app does. Without it, those steps fail with a clear message and you can switch the step's model.

## Configuration

Node 22 or later. `npm ci`.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
GEMINI_API_KEY=...            # optional, server-only
```

Only the publishable key is used; there is no service-role key. The GitHub repository is connected to the Vercel project, so every push to `main` deploys to production. Google OAuth starts and ends on `https://caption-archive-chains.vercel.app`, which is in the Supabase Auth redirect allow-list. Vercel deployment protection is off; the app's own login and superadmin checks stay on.

## Validation

```
npm test            # template variables, references, reorder/delete remapping
npm run typecheck
npm run build
```

`npm run smoke -- <image>` runs a five-step chain (vision description, two text steps, a no-model step and an image step) against the real AI Gateway with an in-memory database stand-in. It passed on November 6, 2026 with a campus photo.

`sql/week8-security-tests.sql` rolls back every change. It passed against the shared database on November 6, 2026. It checks that anonymous visitors cannot read chains or runs, that a member cannot read, create, edit, delete, reorder or upload, and that a superadmin can create chains, append steps in order, edit, reorder with rewritten references, reject partial or foreign reorders, close gaps after a delete, record runs, audit changes and cascade a chain delete.
