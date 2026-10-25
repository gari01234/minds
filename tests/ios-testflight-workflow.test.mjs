import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const yml=readFileSync(new URL("../.github/workflows/ios-testflight.yml",import.meta.url),"utf8");
test("TestFlight signing requires manual trigger, main and protected Apple environment",()=>{
  assert.match(yml,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(yml,/^  push:/m);
  assert.doesNotMatch(yml,/^  pull_request:/m);
  assert.match(yml,/github\.ref == 'refs\/heads\/main'/);
  assert.match(yml,/environment: apple-testflight/);
  assert.match(yml,/contents: read/);
  for(const name of ["ISABELLA_ASC_API_KEY_P8","ISABELLA_ASC_ISSUER_ID","ISABELLA_ASC_KEY_ID"])
    assert.match(yml,new RegExp("secrets\\."+name));
  assert.match(yml,/vars\.ISABELLA_APPLE_TEAM_ID/);
  assert.match(yml,/vars\.ISABELLA_IOS_BUNDLE_ID/);
  assert.match(yml,/-allowProvisioningUpdates/);
  assert.match(yml,/-exportArchive/);
  assert.match(yml,/CODE_SIGN_STYLE=Automatic/);
  assert.match(yml,/<string>upload<\/string>/);
  assert.match(yml,/if: always\(\)/);
});
