"""Fail closed on target, entitlement or distribution-profile mismatches.

Print only a small non-secret receipt, never raw profiles or full build settings.
"""
import datetime
import json
import plistlib
import subprocess
import sys
from pathlib import Path

TARGETS = {"MINDS": "", "MINDSShare": ".share", "MINDSWidget": ".widget"}
GROUPS = "com.apple.security.application-groups"
TEAM = "com.apple.developer.team-identifier"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_settings(rows, bundle_id, team):
    require({row["target"] for row in rows} == set(TARGETS), "Expected exactly three targets")
    for row in rows:
        target, values = row["target"], row["buildSettings"]
        expected = {"PRODUCT_BUNDLE_IDENTIFIER": bundle_id + TARGETS[target],
                    "DEVELOPMENT_TEAM": team, "CODE_SIGN_STYLE": "Automatic",
                    "CODE_SIGN_IDENTITY": "-", "AD_HOC_CODE_SIGNING_ALLOWED": "YES"}
        for key, value in expected.items():
            require(values.get(key) == value, f"{target}: unexpected {key}")
        require(values.get("CODE_SIGNING_ALLOWED") != "NO", f"{target}: entitlements would be lost")
        require(values.get("CODE_SIGN_ENTITLEMENTS"), f"{target}: missing entitlements file")
        for key in ("PROVISIONING_PROFILE", "PROVISIONING_PROFILE_SPECIFIER"):
            require(not values.get(key), f"{target}: archive must not require a profile")
        print(f"{target}: {json.dumps(expected, sort_keys=True)}; entitlements={values['CODE_SIGN_ENTITLEMENTS']}")


def validate_distribution(profile, entitlements, bundle_id, group, team):
    require(profile.get("TeamIdentifier") == [team], "Profile team mismatch")
    require("ProvisionedDevices" not in profile, "Device-based profile is not App Store Connect")
    require(not profile.get("ProvisionsAllDevices"), "Enterprise profile is not App Store Connect")
    require(profile.get("ExpirationDate", datetime.datetime.min) > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), "Expired profile")
    for label, values in (("profile", profile.get("Entitlements", {})), ("signature", entitlements)):
        require(values.get("application-identifier") == f"{team}.{bundle_id}", f"{label}: app identifier mismatch")
        require(values.get(TEAM) == team, f"{label}: team mismatch")
        require(values.get(GROUPS) == [group], f"{label}: App Group mismatch")
        require(values.get("get-task-allow") is False, f"{label}: distribution must disable debugging")
    require(profile["Entitlements"].get("beta-reports-active") is True, "Missing App Store beta entitlement")


def output(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def validate_bundles(mode, root, bundle_id, team):
    apps = list(root.glob("*.app"))
    require(len(apps) == 1, "Expected one app")
    app = apps[0]
    require({p.name for p in (app / "PlugIns").glob("*.appex")} == {"MINDSShare.appex", "MINDSWidget.appex"}, "Missing or unexpected extensions")
    version = None
    for target, suffix in TARGETS.items():
        path = app if not suffix else app / "PlugIns" / f"{target}.appex"
        info = plistlib.loads((path / "Info.plist").read_bytes())
        require(info.get("CFBundleIdentifier") == bundle_id + suffix, f"{target}: bundle ID mismatch")
        current = (info.get("CFBundleShortVersionString"), info.get("CFBundleVersion"))
        require(all(current), f"{target}: missing version/build")
        version = version or current
        require(current == version, f"{target}: version/build mismatch")
        output("codesign", "--verify", "--strict", str(path))
        entitlements = plistlib.loads(output("codesign", "-d", "--entitlements", ":-", str(path)))
        require(entitlements.get(GROUPS) == [f"group.{bundle_id}"], f"{target}: signed App Group missing")
        if mode == "distribution":
            profile = plistlib.loads(output("security", "cms", "-D", "-i", str(path / "embedded.mobileprovision")))
            validate_distribution(profile, entitlements, bundle_id + suffix, f"group.{bundle_id}", team)
            signature = subprocess.run(["codesign", "-dv", str(path)], capture_output=True, check=True).stderr.decode()
            require("Authority=Apple Distribution:" in signature or "Authority=iPhone Distribution:" in signature, f"{target}: no distribution signing authority")
        print(f"{target}: {mode} verified; bundle={bundle_id + suffix}; App Group verified; version={current[0]} ({current[1]})")


if __name__ == "__main__":
    try:
        mode, path, bundle_id, team = sys.argv[1:]
        require(mode in {"settings", "archive", "distribution"}, "Invalid validation mode")
        if mode == "settings":
            validate_settings(json.loads(Path(path).read_text()), bundle_id, team)
        else:
            validate_bundles(mode, Path(path), bundle_id, team)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"Signing validation failed: {error}")
