import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../apps/isabella-ios/", import.meta.url);
const read = path => readFileSync(new URL(path,root),"utf8");
const project=read("project.yml"),share=read("ShareExtension/ShareViewController.swift");
const inbox=read("CaptureShared/CaptureInbox.swift"),widget=read("WidgetExtension/ContinuityWidget.swift");
const snapshot=read("SharedGlance/GlanceStore.swift"),app=read("Sources/AppModel.swift");
const view=read("Sources/Features/Continuity/ContinuityView.swift");

test("Share and Widget are real app extensions, not mock UI screens",()=>{
  assert.match(project,/MINDSShare:\n    type: app-extension/);
  assert.match(project,/MINDSWidget:\n    type: app-extension/);
  assert.match(project,/NSExtensionPointIdentifier: com\.apple\.share-services/);
  assert.match(project,/NSExtensionPointIdentifier: com\.apple\.widgetkit-extension/);
  assert.match(project,/com\.apple\.security\.application-groups/);
  assert.match(project,/group\.\$\(MINDS_BUNDLE_ID\)/);
  assert.match(project,/PRODUCT_BUNDLE_IDENTIFIER: "\$\(MINDS_BUNDLE_ID\)\.share"/);
  assert.match(project,/PRODUCT_BUNDLE_IDENTIFIER: "\$\(MINDS_BUNDLE_ID\)\.widget"/);
});

test("capture is explicit, durable, size-bounded, original preserving, and unclassified",()=>{
  assert.match(share,/Guardar fuente/);
  assert.match(share,/loadFileRepresentation/);
  assert.match(share,/CaptureInboxStore\.stageFile/);
  assert.match(share,/CaptureInboxStore\.stageText/);
  assert.match(inbox,/maxBytes = 12 \* 1024 \* 1024/);
  assert.match(inbox,/SHA256\.hash/);
  assert.match(inbox,/Payload|payloadFileName/);
  assert.match(inbox,/FileProtectionType\.completeUntilFirstUserAuthentication/);
  assert.match(inbox,/\.json"/);
  assert.match(view,/Capturar o revisar fuentes/);
  assert.doesNotMatch(share,/service_role|Bearer |authorization|rest\/v1|supabase/i);
  assert.doesNotMatch(inbox,/minds_work_claims|isabella_memories|accepted_artifact_id/);
});

test("Widget only gets stale-expiring counts; no JWT and no document content",()=>{
  assert.match(widget,/StaticConfiguration\(kind: "IsabellaContinuity"/);
  assert.match(widget,/\.privacySensitive\(\)/);
  assert.match(widget,/GlanceStore\.load\(\)/);
  assert.match(snapshot,/timeIntervalSince\(glance\.updatedAt\) < 4 \* 60 \* 60/);
  assert.match(snapshot,/reviews: items\.filter/);
  assert.match(app,/GlanceStore\.clear\(\)/);
  assert.match(app,/WidgetCenter\.shared\.reloadTimelines/);
  assert.doesNotMatch(snapshot,/access_token|refresh_token|service_role|apiKey|title: item\.title/);
});
