"""Local Apple Distribution signing for Window, through the App Store Connect API.

Why: Apple's cloud-managed signing writes a designated requirement whose
certificate name differs from the certificate only in Unicode normalization
(non-ASCII team name, FB24633162). Every cloud-signed export therefore fails
Apple's 90035 check. Signing on the runner with /usr/bin/codesign lets codesign
derive the requirement from the certificate itself.

Commands (run with the job's App Store Connect key in the environment):
  prepare  <workdir> <team> <bundle> <run>  create key + CSR, an Apple Distribution
           certificate, a temporary keychain and App Store profiles for the three targets
  entitlements <archived-bundle> <profile> <team> <out.plist>
  retire-previous <workdir>                 revoke certificates of earlier Window CI runs

Never prints keys, certificates or profiles; only ids and a small receipt.
"""
import base64
import datetime
import json
import os
import plistlib
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.appstoreconnect.apple.com/v1"
PROFILE_PREFIX = "Window CI "
SUFFIXES = ("", ".share", ".widget")
WWDR_G3 = "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer"


def fail(message):
    raise SystemExit(f"Local signing failed: {message}")


# ---------- pure helpers (unit-tested on Linux) ----------

def distribution_entitlements(archived, profile_entitlements, team, bundle_id):
    """What the signature must carry for App Store / TestFlight distribution."""
    ent = dict(archived or {})
    for key in [k for k in ent if k.startswith("com.apple.developer.") and k not in profile_entitlements and k != "com.apple.developer.team-identifier"]:
        ent.pop(key)  # never claim a capability the profile does not grant
    ent["application-identifier"] = f"{team}.{bundle_id}"
    ent["com.apple.developer.team-identifier"] = team
    ent["get-task-allow"] = False
    if profile_entitlements.get("beta-reports-active") is True:
        ent["beta-reports-active"] = True
    groups = ent.get("com.apple.security.application-groups")
    allowed = profile_entitlements.get("com.apple.security.application-groups")
    if groups is not None:
        if not isinstance(allowed, list) or not set(groups) <= set(allowed):
            fail(f"{bundle_id}: App Group not granted by the profile")
    return ent


def previous_ci_certificates(profiles, current_certificate=None):
    """Certificates used only by earlier 'Window CI' profiles (safe to revoke)."""
    ours, used_elsewhere, profile_ids = set(), set(), []
    for p in profiles:
        name = p.get("attributes", {}).get("name", "")
        certs = {c["id"] for c in p.get("relationships", {}).get("certificates", {}).get("data", []) or []}
        if name.startswith(PROFILE_PREFIX):
            ours |= certs
            profile_ids.append(p["id"])
        else:
            used_elsewhere |= certs
    return sorted(ours - used_elsewhere - {current_certificate}), profile_ids


def profile_name(run, suffix):
    return f"{PROFILE_PREFIX}{run} {suffix.lstrip('.') or 'app'} {datetime.datetime.now(datetime.timezone.utc):%Y%m%d%H%M%S}"


# ---------- App Store Connect API ----------

def token():
    import jwt  # PyJWT, installed in the job's virtualenv
    key = Path(os.environ["ASC_KEY_PATH"]).read_text()
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


def call(method, path, body=None, missing_ok=False):
    request = urllib.request.Request(API + path if path.startswith("/") else path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        if missing_ok and error.code in (404, 409):
            return {}
        try:
            errors = json.loads(error.read()).get("errors", [])
            detail = "; ".join(f"{e.get('code')}: {e.get('detail') or e.get('title')}" for e in errors)
        except Exception:
            detail = ""
        fail(f"App Store Connect {method} {path.split('?')[0]} → HTTP {error.code} {detail}")


def list_all(path):
    out, url = [], path
    while url:
        page = call("GET", url)
        out += page.get("data", [])
        url = page.get("links", {}).get("next")
    return out


# ---------- commands ----------

def prepare(workdir, team, bundle, run):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID

    work = Path(workdir)
    work.mkdir(parents=True, exist_ok=True)
    os.chmod(work, 0o700)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = (x509.CertificateSigningRequestBuilder()
           .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Window CI"),
                                    x509.NameAttribute(NameOID.COUNTRY_NAME, "DE")]))
           .sign(key, hashes.SHA256()))
    csr_b64 = base64.b64encode(csr.public_bytes(serialization.Encoding.DER)).decode()
    created = call("POST", "/certificates", {"data": {"type": "certificates", "attributes": {
        "certificateType": "DISTRIBUTION", "csrContent": csr_b64}}})["data"]
    cert_id = created["id"]
    cert = x509.load_der_x509_certificate(base64.b64decode(created["attributes"]["certificateContent"]))
    ou = cert.subject.get_attributes_for_oid(NameOID.ORGANIZATIONAL_UNIT_NAME)
    if not ou or ou[0].value != team:
        fail("the new certificate does not belong to the expected team")

    # Temporary keychain with the identity and Apple's WWDR G3 intermediate.
    password = secrets.token_urlsafe(24)
    p12_password = secrets.token_urlsafe(24)
    p12 = pkcs12.serialize_key_and_certificates(
        b"Window CI", key, cert, None,
        serialization.PrivateFormat.PKCS12.encryption_builder()
        .kdf_rounds(50000).key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC)
        .hmac_hash(hashes.SHA1()).build(p12_password.encode()))
    p12_path = work / "identity.p12"
    p12_path.write_bytes(p12)
    os.chmod(p12_path, 0o600)
    keychain = str(work / "window-signing.keychain-db")
    wwdr = work / "AppleWWDRCAG3.cer"
    urllib.request.urlretrieve(WWDR_G3, wwdr)
    sh = lambda *a: subprocess.run(a, check=True, capture_output=True)
    sh("security", "create-keychain", "-p", password, keychain)
    sh("security", "set-keychain-settings", "-lut", "3600", keychain)
    sh("security", "unlock-keychain", "-p", password, keychain)
    sh("security", "import", str(p12_path), "-k", keychain, "-P", p12_password, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security")
    sh("security", "import", str(wwdr), "-k", keychain)
    sh("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, keychain)
    current = subprocess.run(["security", "list-keychains", "-d", "user"], check=True, capture_output=True, text=True).stdout
    sh("security", "list-keychains", "-d", "user", "-s", keychain, *[k.strip().strip('"') for k in current.split()])
    p12_path.unlink()
    fingerprint = cert.fingerprint(hashes.SHA1()).hex().upper()
    identities = subprocess.run(["security", "find-identity", "-v", "-p", "codesigning", keychain],
                                check=True, capture_output=True, text=True).stdout
    if fingerprint not in identities:
        fail("the new identity is not usable for code signing (missing chain?)")

    # App Store profiles for the app and both extensions, with this certificate.
    wanted = {bundle + s for s in SUFFIXES}
    bundle_ids = {b["attributes"]["identifier"]: b["id"]
                  for b in list_all("/bundleIds?limit=200&filter[identifier]=" + ",".join(sorted(wanted)))
                  if b["attributes"].get("identifier") in wanted}
    missing = wanted - set(bundle_ids)
    if missing:
        fail("App IDs not registered: " + ", ".join(sorted(missing)))
    profiles = {}
    for suffix in SUFFIXES:
        identifier = bundle + suffix
        data = call("POST", "/profiles", {"data": {"type": "profiles",
            "attributes": {"name": profile_name(run, suffix), "profileType": "IOS_APP_STORE"},
            "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_ids[identifier]}},
                              "certificates": {"data": [{"type": "certificates", "id": cert_id}]}}}})["data"]
        path = work / f"{identifier}.mobileprovision"
        path.write_bytes(base64.b64decode(data["attributes"]["profileContent"]))
        profiles[identifier] = {"id": data["id"], "path": str(path)}
    state = {"certificate_id": cert_id, "identity": fingerprint, "keychain": keychain, "profiles": profiles}
    (work / "state.json").write_text(json.dumps(state))
    print(json.dumps({"certificate_id": cert_id, "identity_sha1": fingerprint[:8] + "…",
                      "profiles": {k: v["id"] for k, v in profiles.items()}}))


def entitlements(archived_bundle, profile, team, out):
    raw = subprocess.run(["codesign", "-d", "--entitlements", "-", "--xml", archived_bundle], capture_output=True, check=True).stdout
    archived = plistlib.loads(raw) if raw.strip() else {}
    decoded = plistlib.loads(subprocess.run(["security", "cms", "-D", "-i", profile], capture_output=True, check=True).stdout)
    info = plistlib.loads((Path(archived_bundle) / "Info.plist").read_bytes())
    ent = distribution_entitlements(archived, decoded.get("Entitlements", {}), team, info["CFBundleIdentifier"])
    Path(out).write_bytes(plistlib.dumps(ent))


def retire_previous(workdir):
    state_path = Path(workdir) / "state.json"
    current = json.loads(state_path.read_text())["certificate_id"] if state_path.exists() else None
    profiles = list_all("/profiles?limit=200&filter[profileType]=IOS_APP_STORE&include=certificates&fields[profiles]=name,certificates")
    current_profiles = set()
    if state_path.exists():
        current_profiles = {p["id"] for p in json.loads(state_path.read_text())["profiles"].values()}
    old = [p for p in profiles if p["id"] not in current_profiles]
    certs, profile_ids = previous_ci_certificates(old + [p for p in profiles if p["id"] in current_profiles], current)
    for pid in profile_ids:
        if pid not in current_profiles:
            call("DELETE", f"/profiles/{pid}", missing_ok=True)
    for cid in certs:
        call("DELETE", f"/certificates/{cid}", missing_ok=True)
    print(json.dumps({"retired_certificates": len(certs), "deleted_profiles": len([p for p in profile_ids if p not in current_profiles])}))


if __name__ == "__main__":
    command, *args = sys.argv[1:] or [""]
    if command == "prepare" and len(args) == 4:
        prepare(*args)
    elif command == "entitlements" and len(args) == 4:
        entitlements(*args)
    elif command == "retire-previous" and len(args) == 1:
        retire_previous(*args)
    else:
        fail("usage: prepare <workdir> <team> <bundle> <run> | entitlements <bundle> <profile> <team> <out> | retire-previous <workdir>")
