# Project: Lovable for Open Models

## What we're building
A Lovable-style, chat-first platform for customising open model weights.
A team picks any open model, brings the content they want the model trained on
plus a plain-English goal, and gets their own trained model back.
Natural language is the programming language.

Inputs: chat, voice, file upload, datasets, database connections.

## Scope (do not expand without the founder's say-so)
**Customer brings:** the content to train on + what they want the model to do.
They own what goes in, its quality, and their rights to use it.

**We do the rest:**
1. Ingest their uploads (files, datasets, DB connections)
2. Convert content into the right training format for the chosen trainer
3. Pick sensible training settings
4. Run the job on the right trainer
5. Hand back the model: download, private Hugging Face repo, or deployed endpoint

**Model choice:** user selects freely. The platform shows which trainer can run
each model and routes the job to it.

**Non-goals:** not an eval product, not a data-prep consultancy, not a
do-everything workbench. Stay lean and focused. Do one loop and make it feel magical.

Small in-scope items: format validation on upload (catch malformed rows before a
paid run) and showing the training metrics the trainers already return.

## Reference example (first target customer)
Australian superannuation fund. Team selects GLM-5.3-Flash, uploads their
industry and business content, describes the goal, trains, gets their model back.

## First milestone: one end-to-end loop
Upload PDFs -> pick GLM-5.3-Flash -> describe goal -> convert to training JSONL
-> fine-tune on Fireworks -> return weights / endpoint.
Once this feels magical, widen: more models, more trainers, more data types.

## Core APIs
| Role | Service | Notes (verified Sept 2026) |
|---|---|---|
| Platform intelligence / agent | OpenRouter | GPT-6 Astra, Claude Fable 5.1, open models. Fable 5.1 on OpenRouter does NOT allow zero data retention: never send raw customer data to it. Pin ZDR providers for sensitive data. |
| Models, weights, storage | Hugging Face | Model catalog, private repos for finished weights, Storage Buckets (S3-compatible, mutable) for uploads and checkpoints, Inference Endpoints. |
| Trainer 1 | Fireworks | SFT, DPO, RFT, LoRA. GLM-5.3-Flash is fine-tunable here. Build SDK: `Dataset.from_file()` + `create_supervised_fine_tuning_job()`. REST job API exposes epochs, LR, LoRA rank, early stop, eval carve-out, region. Australian region AP_NEWSOUTHWALES_1 (quota via sales). Multi-LoRA: up to 100 adapters per deployment. Base models show a Tunable flag. |
| Trainer 2 | Tinker (Thinking Machines) | LoRA, full control of the training loop: SFT, RL (GRPO/PPO), DPO, distillation. Models include GLM-5.3 (256K), Kimi K2.6, Qwen 3.5/3.6/3.8, Nemotron 3, gpt-oss, DeepSeek V3.1, Inkling. Not GLM-5.3-Flash (yet). Machine-readable model list: https://tinker-docs.thinkingmachines.ai/tinker/models.json . Checkpoints downloadable, can publish to HF Hub. Retires models regularly. |
| Trainer 3 | Together AI | LoRA AND full fine-tuning, up to 1T params. SFT + DPO. LoRA on MoE expert layers. Bring-your-own HF model. Early stopping with refunds. Dedicated endpoint hosting is costly (~$6.49/hr H100), so make download / switch-off easy. Check if GLM-5.3-Flash is supported. |
| Fast classifier | Jev (TypeSafe) | Choice / true-false / score only, no text generation. 64K context. ~$0.042/M input, output unmetered. Use for tagging uploads, routing chat intents. |

## Supporting stack
- **Chat UI:** Vercel AI SDK + AI Elements, or assistant-ui
- **Voice:** ElevenLabs Scribe or Deepgram (API); Whisper self-hosted for sensitive customers
- **File parsing:** Docling (structure, tables; MIT) and MarkItDown (fast; MIT)
- **DB connectors:** dlt (open-source Python, reads any SQL database)
- **Content -> training data:** build our own converter. Kiln's Python library (MIT) can help.
  Easy Dataset is a good blueprint but is AGPL-3.0: do not embed it in the hosted service.
- **Long-running jobs:** Trigger.dev (open source, TypeScript, self-hostable); Inngest as lighter alternative
- **Basics:** auth, Postgres, Stripe billing

## Trainer routing
Build a catalog that merges the Hugging Face model list with each trainer's
support list (Fireworks Tunable flag, Tinker models.json, Together supported models).
User sees any model; platform labels what's trainable where and routes the job.

## Australian enterprise notes
- APRA's 30 April 2026 AI letter: AI managed under CPS 230 / CPS 234; expects model
  inventories, third-party model assurance, mapped foundation-model dependencies and
  credible exit/substitution. Open weights the customer owns = strong answer.
- We'd likely be a material service provider under CPS 230: map every data hop.
- Design a "sovereign mode" showing what stays onshore (Fireworks NSW region for
  serving; confirm training locations for each trainer).
- GLM is from Zhipu (China). Self/Fireworks-hosted MIT weights send no data to Zhipu,
  but have that answer ready for boards.

## Kiln: reuse, don't copy the product
Kiln (github.com/Kiln-AI/Kiln) does many things for developers: evals, RAG, agents,
fine-tuning. We are a different product: hosted, chat-first, outcome-focused,
open-weights-first. Do not change the plan because of it.

We CAN reuse pieces of it:
- **OK to use:** the `kiln-ai` Python library and REST server (MIT licensed).
  Useful for synthetic data generation (content -> training examples), dataset
  handling/export formats, and its existing fine-tune integrations with Fireworks
  and Together.
- **Do not copy:** the Kiln desktop app code. It is source-available under a
  fair-code model, not MIT.
- Check the current LICENSE files before vendoring anything.

## Working principles
- Founder's vision is fixed. Don't redesign the product; build it.
- Lean and focused. Resist adding features outside the scope above.
- Verify current API details against live docs before coding. These change often.
