# MINDS Cognitive Architecture v2

This document records the persistent architecture introduced in Build 55–56.

## Layers

1. **User Model** — structured non-sensitive hypotheses and confirmed operating preferences in `isabella_model_claims`.
2. **Curated Memory** — durable explicit autobiographical memory in `isabella_memories`.
3. **Episodic Memory** — conversation history plus derived pre-compaction checkpoints in `minds_memory_flushes`.
4. **Project Knowledge** — Work project claims and evidence in `minds_work_claims` / `minds_work_evidence`, always preserving provenance and epistemic status.
5. **Prospective Memory** — exact-time `isabella_routines` plus contextual `minds_standing_intents`.

## Adaptive routing

Isabella uses deterministic cheap routing first and escalates only when the turn benefits from deeper memory, Work, Sofia, web, more reasoning or more rounds. Simple turns therefore remain cheap without imposing a lower intelligence ceiling on complex turns.

## Policy as code

Persistent/destructive actions are classified as allow / confirm / deny in server code. Calendar/task mutation, routines, standing intents, project-knowledge promotion and Skill creation require explicit user confirmation.

## Specialists

Isabella stays the visible owner of the answer. Sofia, Work, research and deep memory are selectively consulted under the hood.

## Heartbeat versus automations

Automations are exact scheduled jobs. Heartbeat is a deterministic periodic condition check (15 min) that surfaces only concrete state changes such as a nearby event or an overdue-task digest. It does not run a large language model by default.

## Skill Workshop

Base Skills remain system-managed. Personal Skills live in `minds_user_skills`, are versioned per user/agent and become active only after an explicit reviewed proposal.

## Observability

`minds_agent_runs` records execution state, route, latency and errors. The Isabella drawer exposes **Estado de MINDS** for practical health inspection.
