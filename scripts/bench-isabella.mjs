/* Isabella bench · ¿sigue siendo igual de capaz? (11.11.2026)
 *
 * Gari pidió que Isabella y Romy interpreten el contexto como lo hace Claude y dependan de menos
 * reglas, «sin que por estos ajustes sean menos capaces». Esta es la comprobación de esa frase: los
 * mismos momentos, jugados dos veces, por el camino anterior y por el nuevo.
 *
 *   legacy  el paso de enrutado acierta siempre (se le da la ruta correcta de regalo: su mejor caso)
 *           y las instrucciones largas elegidas desde esa ruta; contexto completo precargado.
 *   own     lo publicado: sin modelo que lea antes que ella, notas cortas, nada precargado;
 *           lee el proyecto con search_work cuando hace falta.
 *
 * Cada caso es un momento de una conversación y lo que una asistente capaz haría con él. Se mira lo
 * que hace (qué herramientas usa, con qué argumentos) y unas pocas propiedades de lo que dice;
 * nunca se compara la redacción. Los escenarios son inventados: ninguna persona, cliente ni proyecto
 * real de Gari aparece en ellos (tests/bench/isabella-scenarios.mjs).
 *
 * Nunca llama a producción: no hay base de datos ni ejecución real; las herramientas responden con
 * datos sintéticos y las creaciones se quedan en el aire. Usa una clave de pruebas propia.
 *
 *   node scripts/bench-isabella.mjs --dry-run                 (sin modelo: comprueba el montaje)
 *   OPENAI_API_KEY=… node scripts/bench-isabella.mjs --arm own --arm legacy --repeat 3
 *
 * --repeat n juega cada caso n veces: un modelo no es determinista y un solo intento no distingue
 * una capacidad de una casualidad (pass^k: cuenta como superado lo que sale bien las n veces).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { SCENARIOS, baseContext, defaultToolResult, NOW, LINDENHOF } from "../tests/bench/isabella-scenarios.mjs";
import { interactiveTools } from "../supabase/functions/_shared/isabella-tools.mjs";
import { FOLLOWUP_TOOLS } from "../supabase/functions/_shared/isabella-followups.mjs";
import { isabellaCoreInstructions } from "../supabase/functions/_shared/isabella-core.mjs";
import { turnInstructions, conversationContext, onDemandWorkContext, onDemandProjectModel, bareGreeting, namedProject, DIALOGUE_WINDOW } from "../supabase/functions/_shared/isabella-turn.mjs";
import { relationshipPolicy } from "../supabase/functions/_shared/relationship-policy.ts";
import { dialogueTurnInput } from "../supabase/functions/_shared/turn-capability-contract.mjs";
import { profileTools, profileInstructions } from "../supabase/functions/_shared/assistant-profile.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : fallback; };
const flags = (name) => argv.reduce((a, v, i) => (v === "--" + name ? [...a, argv[i + 1]] : a), []);
const dry = argv.includes("--dry-run");
const arms = flags("arm").length ? flags("arm") : ["own", "legacy"];
const repeat = Math.max(1, Number(flag("repeat", dry ? 1 : 2)) || 1);
const only = flags("case");
const output = flag("out", null);
const FAST = process.env.BENCH_MODEL || "gpt-5.6-luna";
const DEEP = process.env.BENCH_DEEP_MODEL || "gpt-5.6-terra";
const MAX_ROUNDS = 6;

const cases = SCENARIOS.filter((s) => !only.length || only.includes(s.id));

/** The instructions and the context a turn gets, assembled exactly as the engine assembles them. */
function assemble(scenario, arm) {
  const profile = scenario.profile === "office" ? "office" : "window";
  const route = { complexity: "standard", ...(scenario.route || {}) };
  const thread = scenario.thread || null;
  const skills = scenario.skills || [];
  const full = baseContext({
    ...(scenario.context || {}),
    current_work_thread: thread,
    // The legacy arm is given the whole project up front, as the old path preloaded it.
    routed_work_context: route.project ? (arm === "legacy" ? LINDENHOF : onDemandWorkContext(route.project)) : null,
    route: arm === "legacy" ? route : {},
    cognitive_depth: arm === "legacy" ? route.complexity : "standard"
  });
  let tools = interactiveTools({
    clarification: !thread, followUps: thread ? [] : FOLLOWUP_TOOLS, deeper: arm === "own"
  });
  if (profile === "office") tools = profileTools(tools, "office", "Mara Muster");
  const relationship = relationshipPolicy("conversation");
  const skillSummaries = skills.map((s) => ({ slug: s.slug, name: s.name, description: s.description }));
  let instructions = arm === "own"
    ? turnInstructions({ relationship, tools, skills: skillSummaries, thread: !!thread, details: "short", context: full })
    : isabellaCoreInstructions({ relationship, tools, skills: skillSummaries, route, context: full, details: "legacy" })
      + (thread || route.work ? "" : "");
  if (arm === "legacy" && (thread || route.work)) instructions += "\n\nDETALLE WORK PARA ESTE TURNO";
  instructions = profileInstructions(instructions, profile, profile === "office" ? "Mara Muster" : null);
  const context = arm === "own" ? conversationContext(full) : full;
  return { tools, instructions, context, profile, thread, route };
}

function turnInput(scenario, arm) {
  const history = (scenario.history || []).map((m) => ({ ...m, created_at: NOW.date + "T09:00:00Z" }));
  const text = scenario.message;
  const attachments = (scenario.attachments || []).map((a) => ({ ...a }));
  const opts = {
    ...(arm === "own" ? DIALOGUE_WINDOW : {}),
    attachments, timeZone: "Europe/Berlin",
    profile: scenario.profile === "office" ? "office" : "window",
    ownerName: scenario.profile === "office" ? "Mara" : "Gari"
  };
  return dialogueTurnInput(history, text, opts);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(body, key) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) return res.json();
    if (![429, 500, 502, 503, 504].includes(res.status)) {
      const text = await res.text();
      const error = new Error("provider_" + res.status + ": " + text.slice(0, 300));
      // A key that is missing, expired or refused is not a result about her: stop, do not report.
      if ([401, 403].includes(res.status)) error.fatal = true;
      throw error;
    }
    await sleep(1500 * (attempt + 1) ** 2);
  }
  throw new Error("provider_unavailable");
}

/** One turn: rounds of tool calls answered with synthetic results, until she writes her answer. */
async function playTurn(scenario, arm, key) {
  const { tools, instructions, context, thread, route } = assemble(scenario, arm);
  const calls = [];
  let input = [
    { role: "user", content: [{ type: "input_text", text: "CONTEXTO PRIVADO\n" + JSON.stringify(context) }] },
    ...turnInput(scenario, arm)
  ];
  let text = "", deep = false, usage = { input: 0, output: 0 }, rounds = 0;
  // Depth: the old path took it from the router's verdict; the new one from her own think_deeper.
  let model = arm === "legacy"
    ? (route.complexity === "deep" || thread ? DEEP : FAST)
    : (thread ? DEEP : FAST);
  let effort = arm === "legacy" ? (route.complexity === "deep" ? "high" : route.complexity === "light" ? "low" : "medium")
    : (bareGreeting(scenario.message) ? "low" : "medium");
  if (arm === "legacy" && route.complexity === "deep") deep = true;
  let live = tools;
  const started = performance.now();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    rounds++;
    const data = await call({
      model, instructions, input, tools: live, reasoning: { effort },
      max_output_tokens: deep ? 8000 : 4800, store: false
    }, key);
    usage.input += data.usage?.input_tokens || 0;
    usage.output += data.usage?.output_tokens || 0;
    const out = data.output || [];
    text = out.filter((x) => x.type === "message").flatMap((x) => x.content || [])
      .filter((c) => c.type === "output_text").map((c) => c.text).join("\n") || text;
    const fns = out.filter((x) => x.type === "function_call");
    if (!fns.length) break;
    input = [...input, ...out];
    const outputs = [];
    for (const fn of fns) {
      let args = {};
      try { args = JSON.parse(fn.arguments || "{}"); } catch { args = {}; }
      calls.push({ name: fn.name, args });
      if (fn.name === "think_deeper" && !deep) {
        deep = true; model = DEEP; effort = "high";
        live = live.filter((t) => t.name !== "think_deeper");
      }
      const result = scenario.toolResult?.(fn.name, args, scenario) ?? defaultToolResult(fn.name, args, scenario);
      outputs.push({ type: "function_call_output", call_id: fn.call_id, output: JSON.stringify(result) });
    }
    input = [...input, ...outputs];
  }
  return {
    calls, text, deep, rounds, usage,
    latency_ms: Math.round(performance.now() - started),
    preloaded: arm === "legacy" && !!route.project,
    instructions_chars: instructions.length, context_chars: JSON.stringify(context).length,
    tools_chars: JSON.stringify(tools).length
  };
}

function scoreTurn(scenario, turn) {
  const checks = scenario.expect(turn).map(([name, ok]) => ({ name, ok: !!ok }));
  return { pass: checks.every((c) => c.ok), checks };
}

const report = {
  version: "v0.1", generated_at: new Date().toISOString(), mode: dry ? "assembly_check" : "real_model",
  models: dry ? null : { fast: FAST, deep: DEEP }, repeat, arms, cases: cases.length, results: {}
};

if (dry) {
  // No model: check that every arm assembles, every expected tool exists and no scenario is malformed.
  const names = new Set(interactiveTools({ clarification: true, followUps: FOLLOWUP_TOOLS, deeper: true }).map((t) => t.name));
  report.results.assembly = cases.map((scenario) => {
    const rows = arms.map((arm) => {
      const a = assemble(scenario, arm);
      const input = turnInput(scenario, arm);
      return {
        arm, instructions_chars: a.instructions.length, context_chars: JSON.stringify(a.context).length,
        tools: a.tools.length, input_messages: input.length,
        input_has_message: JSON.stringify(input).includes(scenario.message.slice(0, 24))
      };
    });
    const empty = { calls: [], text: "", deep: false, preloaded: false };
    let expectations = null;
    try { expectations = scenario.expect(empty).length; } catch (e) { expectations = "THREW: " + e.message; }
    return { id: scenario.id, about: scenario.about, expectations, arms: rows };
  });
  const bad = report.results.assembly.filter((r) =>
    typeof r.expectations !== "number" || r.arms.some((a) => !a.input_has_message || a.instructions_chars < 5000));
  if (bad.length) { report.problems = bad.map((b) => b.id); process.exitCode = 1; }
  report.tool_names = [...names].length;
} else {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not available; the bench never retrieves a runtime key");
  for (const arm of arms) {
    const rows = [];
    for (const scenario of cases) {
      const plays = [];
      for (let i = 0; i < repeat; i++) {
        try {
          const turn = await playTurn(scenario, arm, key);
          plays.push({ ...scoreTurn(scenario, turn), calls: turn.calls.map((c) => c.name), deep: turn.deep,
            rounds: turn.rounds, latency_ms: turn.latency_ms, usage: turn.usage,
            prompt: { instructions: turn.instructions_chars, context: turn.context_chars, tools: turn.tools_chars } });
        } catch (e) {
          if (e?.fatal) {
            process.stderr.write("\n" + e.message + "\n");
            report.error = "provider_rejected_the_bench_key";
            report.error_detail = String(e.message || e).slice(0, 300);
            writeReport(); process.exit(2);
          }
          plays.push({ pass: false, checks: [], error: String(e.message || e).slice(0, 200) });
        }
      }
      const failed = new Map();
      for (const p of plays) for (const c of p.checks || []) if (!c.ok) failed.set(c.name, (failed.get(c.name) || 0) + 1);
      rows.push({
        id: scenario.id, about: scenario.about,
        pass_all: plays.every((p) => p.pass), passes: plays.filter((p) => p.pass).length, of: plays.length,
        failed_checks: [...failed].map(([name, times]) => ({ name, times })),
        errors: plays.filter((p) => p.error).map((p) => p.error),
        median_latency_ms: median(plays.map((p) => p.latency_ms)),
        input_tokens: Math.round(avg(plays.map((p) => p.usage?.input || 0))),
        output_tokens: Math.round(avg(plays.map((p) => p.usage?.output || 0))),
        rounds: avg(plays.map((p) => p.rounds)), deep: plays.some((p) => p.deep),
        prompt: plays.find((p) => p.prompt)?.prompt || null
      });
      process.stderr.write((rows.at(-1).pass_all ? "·" : "x"));
    }
    const errored = rows.filter((r) => r.errors.length).map((r) => r.id);
    if (errored.length) { report.errored = [...(report.errored || []), ...errored]; process.exitCode = 1; }
    report.results[arm] = {
      cases: rows, errored,
      pass_rate: rows.filter((r) => r.pass_all).length / (rows.length || 1),
      median_latency_ms: median(rows.map((r) => r.median_latency_ms)),
      mean_input_tokens: Math.round(avg(rows.map((r) => r.input_tokens))),
      mean_output_tokens: Math.round(avg(rows.map((r) => r.output_tokens)))
    };
    process.stderr.write("\n");
  }
  if (report.results.own && report.results.legacy) {
    const own = report.results.own, legacy = report.results.legacy;
    const byId = (a) => new Map(a.cases.map((c) => [c.id, c]));
    const o = byId(own), l = byId(legacy);
    report.comparison = {
      pass_rate: { own: own.pass_rate, legacy: legacy.pass_rate },
      // The question Gari asked: is there anything the old path did and the new one does not?
      lost: [...o].filter(([id, c]) => !c.pass_all && l.get(id)?.pass_all).map(([id]) => id),
      gained: [...o].filter(([id, c]) => c.pass_all && !l.get(id)?.pass_all).map(([id]) => id),
      median_latency_ms: { own: own.median_latency_ms, legacy: legacy.median_latency_ms },
      mean_input_tokens: { own: own.mean_input_tokens, legacy: legacy.mean_input_tokens }
    };
    // A capability lost is the one result that must stop the run.
    if (report.comparison.lost.length) process.exitCode = 1;
  }
}

function writeReport() {
  const json = JSON.stringify(report, null, 2);
  if (output) { mkdirSync(output.replace(/\/[^/]+$/, ""), { recursive: true }); writeFileSync(output, json + "\n"); }
  process.stdout.write(json + "\n");
}

function avg(xs) { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
function median(xs) { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; }

writeReport();
