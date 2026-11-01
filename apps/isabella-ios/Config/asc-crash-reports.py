"""Read the crash reports testers shared from TestFlight ("Teilen" / "Share").

Run with the job's App Store Connect key in the environment:
  asc-crash-reports.py <bundle-id> [count]

The repository and its Actions logs are public, so this prints only what a
developer needs to find the cause: when, which build and iOS version, the
exception, the termination reason and the crashing thread. Never the tester's
e-mail, comment, device identifiers or the raw log.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.appstoreconnect.apple.com/v1"
MAX_FRAMES = 30


# ---------- pure helpers (unit-tested on Linux) ----------

def _frame_line(index, frame, images):
    image = images[frame.get("imageIndex")] if isinstance(frame.get("imageIndex"), int) and frame.get("imageIndex") < len(images) else {}
    name = image.get("name") or "?"
    symbol = frame.get("symbol")
    if symbol:
        where = f"{symbol} + {frame.get('symbolLocation', 0)}"
    else:
        where = f"+ {hex(frame.get('imageOffset', 0))}"
    return f"  {index:2d} {name}  {where}"


def summarize_ips(text):
    """Summary lines of an Apple .ips crash report (JSON header line + JSON body)."""
    header_text, _, body_text = text.partition("\n")
    header = json.loads(header_text)
    body = json.loads(body_text)
    images = body.get("usedImages") or []
    lines = []
    exc = body.get("exception") or {}
    if exc:
        lines.append("Exception: " + " ".join(str(exc.get(k)) for k in ("type", "signal", "subtype", "codes") if exc.get(k)))
    term = body.get("termination") or {}
    if term:
        reasons = term.get("reasons") or []
        detail = " | ".join(str(r) for r in reasons) if reasons else term.get("indicator", "")
        lines.append(f"Termination: {term.get('namespace', '')} {term.get('code', '')} {detail}".rstrip())
    for library, messages in (body.get("asi") or {}).items():
        for message in messages if isinstance(messages, list) else [messages]:
            lines.append(f"Info ({library}): {str(message)[:600]}")
    last = body.get("lastExceptionBacktrace") or []
    if last:
        lines.append("Last exception backtrace:")
        lines += [_frame_line(i, f, images) for i, f in enumerate(last[:MAX_FRAMES])]
    threads = body.get("threads") or []
    faulting = body.get("faultingThread")
    thread = next((t for t in threads if t.get("triggered")), None)
    if thread is None and isinstance(faulting, int) and faulting < len(threads):
        thread = threads[faulting]
    if thread:
        label = thread.get("queue") or thread.get("name") or ""
        lines.append(f"Crashed thread {faulting if faulting is not None else ''} {label}".rstrip() + ":")
        lines += [_frame_line(i, f, images) for i, f in enumerate((thread.get("frames") or [])[:MAX_FRAMES])]
    app = header.get("app_version") or body.get("procVersion") or ""
    build = header.get("build_version") or ""
    if app or build:
        lines.insert(0, f"App {app} ({build})".strip())
    return lines


def summarize_text(text):
    """Summary lines of a classic text crash report."""
    keep = ("Exception Type", "Exception Codes", "Exception Subtype", "Exception Reason", "Termination Reason",
            "Termination Description", "Triggered by Thread", "Crashed Thread", "Application Specific Information")
    lines, rows = [], text.splitlines()
    for i, row in enumerate(rows):
        if row.startswith(keep):
            lines.append(row[:600])
            if row.startswith("Application Specific Information"):
                lines += [r[:600] for r in rows[i + 1:i + 6] if r.strip()]
    for i, row in enumerate(rows):
        if row.startswith("Last Exception Backtrace") or (row.startswith("Thread ") and "Crashed" in row):
            lines.append(row)
            for frame in rows[i + 1:i + 1 + MAX_FRAMES]:
                if not frame.strip():
                    break
                lines.append("  " + frame.strip())
    return lines


def summarize(text):
    text = (text or "").strip()
    if not text:
        return ["(empty crash log)"]
    if text.startswith("{"):
        try:
            return summarize_ips(text)
        except (ValueError, AttributeError, TypeError):
            pass
    return summarize_text(text)


# ---------- App Store Connect API ----------

def token():
    import jwt  # PyJWT, installed in the job's virtualenv
    with open(os.environ["ASC_KEY_PATH"]) as handle:
        key = handle.read()
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


class ApiError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def get(path):
    request = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + token()})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            errors = json.loads(error.read()).get("errors", [])
            detail = "; ".join(f"{e.get('code')}: {e.get('detail') or e.get('title')}" for e in errors)
        except Exception:
            detail = ""
        raise ApiError(error.code, f"App Store Connect GET {path.split('?')[0]} → HTTP {error.code} {detail}")


def main(bundle_id, count=3):
    apps = get("/apps?" + urllib.parse.urlencode({"filter[bundleId]": bundle_id, "fields[apps]": "bundleId"}))["data"]
    app = next((a for a in apps if a["attributes"]["bundleId"] == bundle_id), None)
    if not app:
        raise SystemExit("App not found in App Store Connect")
    base = f"/apps/{app['id']}/betaFeedbackCrashSubmissions?"
    try:
        page = get(base + urllib.parse.urlencode({"sort": "-createdDate", "limit": str(count), "include": "build"}))
    except ApiError as error:
        if error.code != 400:
            raise
        # Older API versions: no sort/include; newest are still returned first in practice.
        page = get(base + urllib.parse.urlencode({"limit": str(count)}))
    builds = {b["id"]: b["attributes"].get("version") for b in page.get("included", []) if b.get("type") == "builds"}
    submissions = page.get("data", [])
    print(f"Shared crash reports found: {len(submissions)} (newest first)")
    for item in submissions:
        a = item["attributes"]
        build_id = ((item.get("relationships") or {}).get("build") or {}).get("data") or {}
        uptime = a.get("appUptimeInMilliseconds")
        print("\n=== " + " · ".join(str(x) for x in [
            a.get("createdDate"), "build " + str(builds.get(build_id.get("id"), "?")),
            "iOS " + str(a.get("osVersion")), a.get("deviceModel"),
            f"open {round(uptime / 1000)} s" if isinstance(uptime, (int, float)) else None] if x))
        log = get(f"/betaFeedbackCrashSubmissions/{item['id']}/crashLog").get("data", {}).get("attributes", {}).get("logText", "")
        for line in summarize(log):
            print(line)


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: asc-crash-reports.py <bundle-id> [count]")
    try:
        main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) == 3 else 3)
    except ApiError as error:
        raise SystemExit(str(error))
