import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root = new URL("../apps/isabella-ios/", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const backend = read("Sources/Services/BackendClient.swift");
const model = read("Sources/AppModel.swift");
const intents = read("Sources/Services/MINDSAppIntents.swift");
const project = read("project.yml");

test("native owner auth is OTP and Keychain protected, with no silent signup", () => {
  assert.match(backend, /"auth\/v1\/otp"/);
  assert.match(backend, /"create_user": false/);
  assert.match(backend, /"auth\/v1\/verify"/);
  assert.match(backend, /"auth\/v1\/token"/);
  assert.match(backend, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  assert.match(backend, /status != errSecSuccess/);
  assert.doesNotMatch(backend, /UserDefaults|service_role|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(project, /INFOPLIST_KEY_SUPABASE_ANON_KEY/);
});

test("native tool-capable chat never downgrades or retries an ambiguous turn", () => {
  assert.match(backend, /"surface": "chat_browser"/);
  assert.match(backend, /"client_message_id": requestID\.uuidString/);
  assert.match(backend, /"durable": false/);
  assert.match(backend, /"stream": false/);
  assert.match(backend, /"current_local_datetime"/);
  assert.match(model, /Never start another model call automatically/);
});

test("review is owner receipt based with canonical readback and no Siri write", () => {
  assert.match(backend, /minds_commit_reviewed_task_update_v01/);
  assert.match(backend, /minds_commit_reviewed_task_create_v01/);
  assert.match(backend, /minds_resolve_shadow_decision/);
  assert.match(backend, /receipt\["receipt_id"\]/);
  assert.match(backend, /abs\(actual\.timeIntervalSince\(expected\)\) < 0\.001/);
  assert.match(backend, /row\["id"\] as\? String == entityID/);
  assert.match(model, /pendingReview = nil/);
  assert.match(intents, /TodayMINDSIntent/);
  assert.doesNotMatch(intents, /minds_commit_reviewed|minds_resolve_shadow/);
});

test("native reload restores owner-scoped pending review only from stored evidence", () => {
  assert.match(backend, /func pendingReview\(\)/);
  assert.match(backend, /"review_proposals"/);
  assert.match(backend, /record\["status"\] as\? String == "pending"/);
  assert.match(backend, /record\["proposal_kind"\] as\? String == "task"/);
  assert.match(backend, /"request_id"/);
  assert.match(model, /backend\.pendingReview\(\)/);
});

test("Siri reads only owner calendar rows for the exact day, not a capped snapshot", () => {
  assert.match(backend, /func todayTasks\(\)/);
  assert.match(backend, /"due_date", value: "eq\." \+ today/);
  assert.match(backend, /"completed_at", value: "is\.null"/);
  assert.match(intents, /BackendClient\(\)\.todayTasks\(\)/);
});

test("native protocol handles single proposal field and enforces typed outcome", () => {
  assert.match(backend, /let plural = result\["proposals"\]/);
  assert.match(backend, /result\["proposal"\] as\? \[String: Any\]/);
  assert.match(backend, /registeredCount == proposals\.count/);
  assert.match(backend, /appliedCount == 0/);
  assert.match(backend, /outcome == "proposal_created"/);
});

test("native task review shows changed fields and refuses unrecognized proposals", () => {
  const ui = read("Sources/Features/Chat/ChatView.swift");
  assert.match(backend, /Set\(candidate\.keys\)\.isSubset\(of: Self\.knownFields\)/);
  assert.match(backend, /if let recurrence = candidate\["recurrence"\]/);
  assert.match(backend, /var reviewDetails: \[ReviewDetail\]/);
  for (const field of ["target_title","target_date","title","date","time","notes","reminder_time","clear_date","project","category"])
    assert.ok(backend.includes('"'+field+'"'), "missing review detail "+field);
  assert.match(ui, /ForEach\(proposal\.reviewDetails\)/);
  assert.match(ui, /if proposal\.reviewable/);
});
