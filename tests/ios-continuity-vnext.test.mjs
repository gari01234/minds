import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../apps/isabella-ios/Sources/", import.meta.url);
const file = path => readFileSync(new URL(path, root), "utf8");
const backend = file("Services/BackendClient.swift");
const model = file("AppModel.swift");
const view = file("Features/Continuity/ContinuityView.swift");
const shell = file("RootView.swift");

test("Continuity is an owner-scoped read model with canonical source IDs", () => {
  assert.match(backend, /func continuityItems\(\)/);
  for (const name of ["minds_shadow_decisions","minds_attention_events","minds_mission_runs","minds_commitments"]) {
    assert.match(backend, new RegExp("rest/v1/" + name));
  }
  assert.match(backend, /ownerFilter = URLQueryItem\(name: "user_id"/);
  assert.match(backend, /"requires_user", value: "eq.true"/);
  assert.match(backend, /"consumed_at", value: "is.null"/);
  assert.match(backend, /"status", value: "eq.pending"/);
  assert.match(backend, /"status", value: "eq.active"/);
  assert.doesNotMatch(backend.slice(backend.indexOf("func continuityItems()"), backend.indexOf("func todayTasks()")), /method: "POST"|\bupdate\(|\.insert\(/);
});
test("Continuity does not infer approval or actionable status from model text", () => {
  assert.match(backend, /"paused" \? "Pausada"/);
  assert.match(backend, /"waiting" \? "Esperando una condición"/);
  assert.match(view, /model\.continuityError/);
  assert.match(view, /model\.section = \.chat/);
  assert.doesNotMatch(view, /aprobar automáticamente|urgencyScore|TextField\(/);
});
test("Native views stay available but the shell shows only the web app (no Feed, Ideas or Readings either)", () => {
  assert.match(shell, /FullMINDSView\(\)/);
  assert.doesNotMatch(shell, /ContinuityView\(\)|ChatView\(\)|CalendarHomeView\(\)/);
  assert.match(view, /struct ContinuityView/);
  assert.doesNotMatch(shell, /FeedView\(\)|IdeasView\(\)|ReadingsView\(\)/);
  assert.match(model, /var section: Section = \.web/);
  assert.match(model, /func reloadContinuity\(\)/);
  assert.match(model, /continuityItems = \[\]/);
});

test("Paused missions are not presented as work actively running", () => {
  const continuity = file("Features/Continuity/ContinuityItem.swift");
  assert.match(continuity, /case \.mission: return "Estado del trabajo"/);
  assert.doesNotMatch(continuity, /case \.mission: return "Trabajo en curso"/);
});
