import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// «Guardar desde Outlook» into the Desktop of a TBA Office project (Gari, 25.11.2026: Office first).
const ios = new URL("../apps/isabella-ios/", import.meta.url);
const read = path => readFileSync(new URL(path, ios), "utf8");
const shared = read("OfficeShared/OfficeShare.swift");
const share = read("ShareExtension/ShareViewController.swift");
const app = read("Sources/AppModel.swift");
const office = read("Sources/Services/OfficeSession.swift");
const project = read("project.yml");

test("same storage path and row as the office web page (app/work.js uploadFiles)", () => {
  assert.match(shared, /"\\\(userID\)\/\\\(projectID\)\/\\\(folderID \?\? "root"\)\/\\\(millis\)-\\\(random\)-\\\(safeName\(name\)\)"/);
  assert.match(shared, /request\("storage\/v1\/object\/minds-work\/" \+ path, method: "POST",\s*headers: \["Content-Type": mime, "x-upsert": "false"\]\)/);
  for (const field of ["project_id", "folder_id", "name", "mime_type", "size_bytes", "storage_path", "source_kind", "metadata"])
    assert.match(shared, new RegExp(`"${field}":`), field);
  // Without its row the stored file goes again, like the web page.
  assert.match(shared, /request\("storage\/v1\/object\/minds-work\/" \+ path, method: "DELETE"\)/);
  // safeName and sourceKind as in app/work.js.
  assert.match(shared, /"\[\^a-zA-Z0-9\._-\]\+", with: "-"/);
  assert.match(shared, /prefix\(150\)/);
  assert.match(shared, /\\\\\.\(pdf\|doc\|docx\|xls\|xlsx\|ppt\|pptx\|txt\|rtf\)\$/);
  assert.match(shared, /maxBytes = 50 \* 1024 \* 1024/);
});

test("only the projects in whose team the person is, active ones; RLS decides", () => {
  assert.match(shared, /"project_id,office_projects\(id,name,number,status\)"/);
  assert.match(shared, /URLQueryItem\(name: "user_id", value: "eq\." \+ access\.userID\)/);
  assert.match(shared, /project\["status"\] as\? String == "aktiv"/);
  assert.match(shared, /"Bearer " \+ access\.accessToken/);
  assert.doesNotMatch(shared + share, /service_role|sb_secret_|grant_type|refresh_token/);
});

test("the share sheet never refreshes: an expired token stages the file for the app", () => {
  assert.match(shared, /expires > Date\(\)\.timeIntervalSince1970 \+ minimumValidity/);
  assert.match(shared, /kSecAttrAccessGroup as String: group/);
  assert.match(shared, /static let key = "tba\.office\.native\.session"|private static let key = "tba\.office\.native\.session"/);
  assert.match(share, /OfficeShareStore\.stage\(fileAt: file\.url, name: file\.name, mime: file\.mime,\s*target: target, userID: user\)/);
  assert.match(app, /func syncOfficeShare\(\) async/);
  assert.match(app, /guard item\.userID == access\.userID else \{ OfficeShareStore\.remove\(item\); continue \}/);
  assert.match(app, /try await uploader\.upload\(fileAt: file, name: item\.name, mime: item\.mime, target: item\.target\)/);
  assert.match(office, /func shareAccess\(\) async throws -> OfficeShareAccess\?/);
  // Signing out of Office leaves nothing of that person for the share sheet.
  assert.match(app, /await office\.logout\(\)\n\s*\/\/[^\n]*\n\s*OfficeShareStore\.clearAll\(\)/);
});

test("Office first; the extension knows the office address and takes up to ten files", () => {
  assert.match(share, /account = officeAvailable \? \.office : \.personal/);
  assert.match(project, /OFFICE_SUPABASE_URL: https:\/\/ynzsbemisjvfgbqcqliq\.supabase\.co/);
  assert.match(project, /OFFICE_SUPABASE_KEY: sb_publishable_/);
  assert.match(project, /NSExtensionActivationSupportsFileWithMaxCount: 10/);
  assert.match(project, /- ShareExtension\n\s*- CaptureShared\n\s*- OfficeShared\n/);
});

test("every share text exists in German and Spanish, and the office text says KI, not Romy", () => {
  const keys = [...new Set([...share.matchAll(/L\("([a-z.]+)"\)/g)].map(m => m[1]))];
  assert.ok(keys.length >= 15, "the sheet's texts are localized");
  for (const lang of ["de", "es"]) {
    const strings = read(`Localization/Share/${lang}.lproj/Localizable.strings`);
    for (const key of keys) assert.match(strings, new RegExp(`^"${key.replace(/\./g, "\\.")}" = "[^"]+";$`, "m"), `${lang}: ${key}`);
    assert.doesNotMatch(strings, /Romy/);
  }
  assert.match(read("Localization/Share/de.lproj/Localizable.strings"), /"share\.office\.reads" = "[^"]*KI des Office[^"]*";/);
});
