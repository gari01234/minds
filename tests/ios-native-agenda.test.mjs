import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root = new URL("../apps/isabella-ios/", import.meta.url);
const read = name => readFileSync(new URL(name, root), "utf8");

test("native agenda reads only current owner sources without local writes", () => {
  const source = read("Sources/Services/BackendClient.swift");
  assert.match(source, /func events\(\)/);
  assert.match(source, /"rest\/v1\/isabella_events"/);
  assert.match(source, /"starts_at", value: "gte\." \+ utc/);
  assert.match(source, /"rest\/v1\/isabella_tasks"/);
  assert.doesNotMatch(source, /"rest\/v1\/isabella_events", method: "POST"/);
});

test("task local notifications are opt in, scheduled and scoped to this app", () => {
  const service = read("Sources/Services/NotificationService.swift");
  const app = read("Sources/AppModel.swift");
  const calendar = read("Sources/Features/Calendar/CalendarHomeView.swift");
  assert.match(service, /requestAuthorization\(options:/);
  assert.match(service, /func syncTaskReminders/);
  assert.match(service, /task\.reminderTime/);
  assert.match(service, /task\.dueDate/);
  assert.match(service, /prefix = "minds\.native\.task\."/);
  assert.match(service, /filter \{ \$0\.hasPrefix\(prefix\) \}/);
  assert.match(service, /prefix\(50\)/);
  assert.match(app, /func enableLocalReminders/);
  assert.match(app, /func disableLocalReminders/);
  assert.match(calendar, /"Activar avisos locales"/);
});

test("Siri next-event and tasks remain read only", () => {
  const intents = read("Sources/Services/MINDSAppIntents.swift");
  assert.match(intents, /NextMINDSCalendarEventIntent/);
  assert.match(intents, /BackendClient\(\)\.events\(\)/);
  assert.match(intents, /BackendClient\(\)\.todayTasks\(\)/);
  assert.doesNotMatch(intents, /minds_commit_reviewed_task|minds_resolve_shadow/);
});

test("local reminders filter future timed candidates before applying iOS cap", () => {
  const service = read("Sources/Services/NotificationService.swift");
  assert.match(service, /tasks\.compactMap/);
  assert.match(service, /\.sorted \{ \$0\.date < \$1\.date \}/);
  assert.match(service, /for candidate in candidates\.prefix\(50\)/);
  assert.doesNotMatch(service, /tasks\.filter\(\{ \$0\.completedAt == nil \}\)\.prefix\(50\)/);
  assert.match(service, /fire > now/);
});

test("local reminders query eligible owner tasks independent of the agenda cap", () => {
  const backend = read("Sources/Services/BackendClient.swift");
  const app = read("Sources/AppModel.swift");
  assert.match(backend, /func localReminderTasks\(\)/);
  assert.match(backend, /"reminder_time", value: "not\.is\.null"/);
  assert.match(backend, /"due_date", value: "gte\." \+ today/);
  assert.match(backend, /"archived_at", value: "is\.null"/);
  assert.match(app, /backend\.localReminderTasks\(\)/);
});
