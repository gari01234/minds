import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The office day for the widget and Siri (Gari, 25.11.2026: Office first).
const ios = new URL("../apps/isabella-ios/", import.meta.url);
const read = path => readFileSync(new URL(path, ios), "utf8");
const glance = read("OfficeShared/OfficeGlance.swift");
const widget = read("WidgetExtension/OfficeWidget.swift");
const bundle = read("WidgetExtension/ContinuityWidget.swift");
const intents = read("Sources/Services/MINDSAppIntents.swift");
const app = read("Sources/AppModel.swift");
const project = read("project.yml");

test("Heute follows the office rule of whose task it is (app/sync.js)", () => {
  // Own, assigned or linked; due today or running today; open and not archived.
  assert.match(glance, /var whose = "user_id\.eq\.\\\(me\),assignee_person_id\.eq\.\\\(me\)"/);
  assert.match(glance, /or\(due_date\.eq\.\\\(today\),and\(start_date\.lte\.\\\(today\),due_date\.gt\.\\\(today\)\)\)/);
  assert.match(glance, /URLQueryItem\(name: "completed_at", value: "is\.null"\)/);
  assert.match(glance, /URLQueryItem\(name: "archived_at", value: "is\.null"\)/);
  // With responsibles it is theirs; without, the creator's. Links first, the primary only without links.
  assert.match(glance, /if people\.isEmpty, let primary = \(task\["assignee_person_id"\] as\? String\)\?\.lowercased\(\) \{ people = \[primary\] \}/);
  assert.match(glance, /if !people\.isEmpty \|\| linked\.contains\(id\) \{ return people\.contains\(me\) \|\| linked\.contains\(id\) \}/);
  assert.match(glance, /return \(task\["user_id"\] as\? String\)\?\.lowercased\(\) == me/);
});

test("Fristen are the milestones of the active team's Terminpläne; zu bestätigen counts like the Bandeja", () => {
  assert.match(glance, /"rest\/v1\/office_terminplan_instances"/);
  assert.match(glance, /URLQueryItem\(name: "is_archived", value: "eq\.false"\)/);
  assert.match(glance, /project\["status"\] as\? String == "aktiv"/);
  assert.match(glance, /step\["type"\] as\? String == "milestone"/);
  assert.match(glance, /guard day >= today else \{ continue \}/);
  assert.match(glance, /case "deadline", "decision": return true/);
  assert.match(glance, /case "commitment": return kind == "aufgabe"/);
  assert.match(glance, /case "open_question": return kind == "widerspruch"/);
  assert.doesNotMatch(glance, /method: "POST"|"PATCH"|"DELETE"|grant_type|refresh_token|service_role/);
});

test("the widget only reads the app's snapshot of today, privately, Office first", () => {
  assert.match(widget, /OfficeGlanceStore\.load\(\)/);
  assert.doesNotMatch(widget, /OfficeGlanceLoader|OfficeShareKeychain|URLSession|Bearer/);
  assert.match(widget, /\.privacySensitive\(\)/);
  assert.match(glance, /Calendar\.current\.isDateInToday\(glance\.updatedAt\)/);
  assert.match(bundle, /OfficeTodayWidget\(\)\n\s*IsabellaContinuityWidget\(\)/);
  assert.match(project, /- Sources\/Features\/Continuity\/ContinuityItem\.swift\n\s*- OfficeShared\n\s*- Localization\/Widget\n/);
  for (const lang of ["de", "es"]) {
    const strings = read(`Localization/Widget/${lang}.lproj/Localizable.strings`);
    for (const key of ["name", "description", "today", "deadline", "toconfirm", "open"])
      assert.match(strings, new RegExp(`^"widget\\.office\\.${key}" = "[^"]+";$`, "m"), `${lang}: ${key}`);
    assert.doesNotMatch(strings, /Romy/);
  }
  // The app keeps the snapshot fresh and leaves nothing after signing out of Office.
  assert.match(app, /OfficeGlanceStore\.save\(glance\)\n\s*WidgetCenter\.shared\.reloadTimelines\(ofKind: "WindowOffice"\)/);
  assert.match(app, /OfficeGlanceStore\.clear\(\)/);
});

test("Siri answers about the office read only, in Spanish, with the valid token first", () => {
  assert.match(intents, /if let current = OfficeShareKeychain\.access\(\) \{ access = current \}\s*else \{ access = try await OfficeSession\(\)\.shareAccess\(\) \}/);
  assert.match(intents, /"Qué tengo hoy en la oficina en \\\(\.applicationName\)"/);
  assert.match(intents, /"Próxima Frist en \\\(\.applicationName\)"/);
  assert.match(intents, /struct OfficeTodayIntent: AppIntent/);
  assert.match(intents, /struct OfficeNextDeadlineIntent: AppIntent/);
  assert.doesNotMatch(intents.slice(intents.indexOf("struct OfficeTodayIntent")), /openAppWhenRun = true/);
});
