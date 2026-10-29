"""Fail closed on target, entitlement or distribution-profile mismatches.

Print only a small non-secret receipt, never raw profiles or full build settings.
"""
import datetime
import json
import plistlib
import re
import subprocess
import sys
import unicodedata
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


def signing_authority(path):
    # TN3161: the certificate chain requires two verbosity levels; -dv omits it.
    details = subprocess.run(["codesign", "--display", "--verbose=2", str(path)],
                             capture_output=True, check=True, text=True).stderr
    return next((line.removeprefix("Authority=") for line in details.splitlines()
                 if line.startswith("Authority=")), "")


def requirement_summary(requirement, authority):
    # Report comparisons, never the certificate holder's name or raw requirement.
    summary = {"uses_cdhash": "cdhash " in requirement,
               "uses_certificate_cn": "certificate leaf[subject.CN]" in requirement}
    match = re.search(r'certificate leaf\[subject.CN\]\s*=\s*(0x[0-9a-fA-F]+|"[^"\\]*")', requirement)
    if match and authority:
        value = match[1]
        cn = bytes.fromhex(value[2:]).decode("utf-8") if value.startswith("0x") else value[1:-1]
        summary.update(cn_matches_authority=cn == authority,
                       cn_matches_after_nfc=unicodedata.normalize("NFC", cn) == unicodedata.normalize("NFC", authority))
    return summary


def verify_signature(path):
    # TN2206: verbose verification also evaluates the code's own designated
    # requirement. A valid seal alone did not catch run #4's Apple 90035 errors.
    result = subprocess.run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(path)],
                            capture_output=True, text=True)
    if result.returncode:
        try:
            details = subprocess.run(["codesign", "--display", "--requirements", "-", str(path)],
                                     capture_output=True, check=True, text=True)
            summary = requirement_summary(details.stdout + details.stderr, signing_authority(path))
        except (ValueError, OSError, subprocess.CalledProcessError):
            summary = {"requirement_diagnostic_unavailable": True}
        reason = result.stderr.strip().replace(str(path), path.name)
        raise ValueError(f"{path.name}: signature verification failed: {reason}; {json.dumps(summary, sort_keys=True)}")


def validate_metadata(info, target):
    require(info.get("CFBundleDisplayName") == "Window", f"{target}: missing or unexpected CFBundleDisplayName")
    if target == "MINDSShare":
        rule = info.get("NSExtension", {}).get("NSExtensionAttributes", {}).get("NSExtensionActivationRule")
        require(isinstance(rule, dict), "MINDSShare: missing activation rule dictionary")
        require(rule.get("NSExtensionActivationSupportsText") is True, "MINDSShare: missing text support")
        for kind in ("WebURL", "Image", "File"):
            value = rule.get(f"NSExtensionActivationSupports{kind}WithMaxCount")
            require(type(value) is int and value == 1, f"MINDSShare: unexpected {kind} activation limit")


def validate_bundles(mode, root, bundle_id, team):
    apps = list(root.glob("*.app"))
    require(len(apps) == 1, "Expected one app")
    app = apps[0]
    require({p.name for p in (app / "PlugIns").glob("*.appex")} == {"MINDSShare.appex", "MINDSWidget.appex"}, "Missing or unexpected extensions")
    version = None
    signature_errors = []
    for target, suffix in TARGETS.items():
        path = app if not suffix else app / "PlugIns" / f"{target}.appex"
        info = plistlib.loads((path / "Info.plist").read_bytes())
        validate_metadata(info, target)
        require(info.get("CFBundleIdentifier") == bundle_id + suffix, f"{target}: bundle ID mismatch")
        current = (info.get("CFBundleShortVersionString"), info.get("CFBundleVersion"))
        require(all(current), f"{target}: missing version/build")
        version = version or current
        require(current == version, f"{target}: version/build mismatch")
        try:
            verify_signature(path)
        except ValueError as error:
            signature_errors.append(str(error))
            continue
        entitlements = plistlib.loads(output("codesign", "-d", "--entitlements", ":-", str(path)))
        require(entitlements.get(GROUPS) == [f"group.{bundle_id}"], f"{target}: signed App Group missing")
        if mode == "distribution":
            profile = plistlib.loads(output("security", "cms", "-D", "-i", str(path / "embedded.mobileprovision")))
            validate_distribution(profile, entitlements, bundle_id + suffix, f"group.{bundle_id}", team)
            authority = signing_authority(path)
            require(authority, f"{target}: codesign did not report a signing authority")
            require(authority.startswith(("Apple Distribution:", "iPhone Distribution:")), f"{target}: no distribution signing authority")
        print(f"{target}: {mode} verified; bundle={bundle_id + suffix}; App Group verified; version={current[0]} ({current[1]})")
    require(not signature_errors, "\n".join(signature_errors))


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
