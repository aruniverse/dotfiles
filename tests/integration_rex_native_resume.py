"""Verify Rex native restore for plain Pi and both fixed persona launchers."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
home = Path.home()
rex = shutil.which("rex")
pi = shutil.which("pi")
node = shutil.which("node")
root = Path(tempfile.mkdtemp(prefix="pi-rex-native-test-", dir="/tmp"))
testhome = root / "home"
testhome.mkdir()
socket = root / "server.sock"
config = root / "config.lua"
config.write_text((ROOT / "config/rex/pi_resume.lua").read_text().replace("~/", str(testhome) + "/"))
work = testhome / ".pi/agent"
personal = testhome / ".pi/personas/personal"
for directory in (work, personal):
    directory.mkdir(parents=True)
    (directory / "settings.json").write_text(json.dumps({"packages": [], "defaultProvider": "idle-test", "defaultModel": "idle-only"}))
    (directory / "models.json").write_text(json.dumps({"providers": {"idle-test": {"baseUrl": "http://127.0.0.1:9/v1", "api": "openai-completions", "apiKey": "local-test-placeholder", "models": [{"id": "idle-only"}]}}}))
    (directory / "sessions").mkdir()
shutil.copytree(ROOT / "config/pi/extensions/rex-native-resume", work / "extensions/rex-native-resume")
(personal / "extensions").symlink_to(work / "extensions")
for name in ("fd", "rg"):
    source = home / ".pi/agent/bin" / name
    if source.is_file():
        for directory in (work, personal):
            (directory / "bin").mkdir(exist_ok=True)
            shutil.copy2(source, directory / "bin" / name)
localbin = testhome / ".local/bin"
localbin.mkdir(parents=True)
for name in ("pi-work", "pi-personal"):
    shutil.copy2(ROOT / "bin" / name, localbin / name)
path = str(localbin) + ":" + str(Path(node).parent) + ":" + str(Path(rex).parent) + ":/usr/bin:/bin:/usr/sbin:/sbin"
startup = "".join("export " + key + "=" + shlex.quote(value) + "\n" for key, value in {
    "HOME": str(testhome), "PATH": path, "PI_CODING_AGENT_DIR": str(work),
    "REX_SERVER": "unix://" + str(socket),
}.items())
(testhome / ".zprofile").write_text(startup)
(testhome / ".zshrc").write_text(startup)
env = {k: v for k, v in os.environ.items() if not k.startswith("REX_") and k not in ["OSC7577_TOKEN", "OPENROUTER_API_KEY", "COPILOT_GITHUB_TOKEN"]}
env.update({"ZDOTDIR": str(testhome), "PATH": path})
arguments = [rex, "server", "run", "--listen", "unix://" + str(socket), "--state-dir", str(root / "state"), "--config", str(config)]
log = (root / "server.log").open("w")
server = None
panes = []


def call(*parts, decode=True):
    result = subprocess.run([rex, "--server", "unix://" + str(socket), "--autostart=false", *parts], env=env, capture_output=True, text=True, timeout=10)
    if result.returncode:
        raise RuntimeError(result.stderr[-500:])
    return json.loads(result.stdout) if decode else result.stdout


def start():
    process = subprocess.Popen(arguments, env=env, stdout=log, stderr=log)
    try:
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError("Isolated server exited")
            if socket.exists():
                try:
                    return process, call("whoami", "--json")
                except (RuntimeError, subprocess.TimeoutExpired):
                    pass
            time.sleep(0.05)
        raise RuntimeError("Isolated server startup timed out")
    except BaseException:
        process.terminate()
        process.wait(timeout=10)
        raise


def record(pane, previous=None):
    for _ in range(240):
        result = call("block", "call", "-s", pane["session"], "-b", pane["block"], "program_resume_records")
        matches = [r for r in result.get("records", []) if r.get("command") == [pane["program"], "--session", str(pane["file"])]]
        for entry in matches:
            if not entry.get("trusted"):
                raise RuntimeError(pane["program"] + " record was rejected: " + str(entry.get("untrusted_reason")))
            if entry.get("chosen") and entry.get("owner", {}).get("pid") != previous:
                return entry
        time.sleep(0.05)
    raise RuntimeError(pane["program"] + " did not report a chosen native resume record")


try:
    server, first = start()
    for program, directory in [("pi", work), ("pi-work", work), ("pi-personal", personal)]:
        file = directory / "sessions" / (program + ".jsonl")
        file.write_text(json.dumps({"type": "session", "version": 3, "id": str(uuid.uuid4()), "timestamp": "2026-11-25T00:00:00.000Z", "cwd": str(root)}) + "\n")
        created = call("new", program + "-test", "--shell=none", "--json", "--", "/bin/zsh", "-i")
        pane = {"program": program, "file": file, "session": created["session_id"], "block": created["initial_windows"][0]["block_ids"][0]}
        panes.append(pane)
        call("send", "-s", pane["session"], "-b", pane["block"], "--", program + " --session " + shlex.quote(str(file)), decode=False)
        call("send-key", "-s", pane["session"], "-b", pane["block"], "enter", decode=False)
        entry = record(pane)
        pane["owner"] = entry["owner"]["pid"]
        print("PASS: " + program + " reported a trusted, chosen native record.")
    server.terminate()
    server.wait(timeout=15)
    server = None
    server, second = start()
    assert first["instance_id"] != second["instance_id"]
    for pane in panes:
        record(pane, pane["owner"])
        messages = [json.loads(line) for line in pane["file"].read_text().splitlines() if line.strip()]
        assert not any(message.get("type") == "message" for message in messages), "A model/user turn was unexpectedly replayed"
        print("PASS: " + pane["program"] + " natively resumed its exact conversation with no model/user turns.")
        call("send-key", "-s", pane["session"], "-b", pane["block"], "ctrl+d", decode=False)
        for _ in range(80):
            entries = call("block", "call", "-s", pane["session"], "-b", pane["block"], "program_resume_records").get("records", [])
            if not entries:
                break
            time.sleep(0.05)
        assert not entries, "Intentional quit retained a resume record"
        print("PASS: intentional quit cleared " + pane["program"] + "'s native record.")
except BaseException:
    if server is not None and panes:
        pane = panes[-1]
        try:
            capture = call("capture", "-s", pane["session"], "-b", pane["block"], "--trim", decode=False)
            print("Isolated startup diagnostic:\n" + capture[-3500:])
        except Exception:
            pass
    raise
finally:
    if server is not None:
        server.terminate()
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
    log.close()
    shutil.rmtree(root)
