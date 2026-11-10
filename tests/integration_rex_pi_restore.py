"""Restart an isolated Rex server and restore an idle Pi, without model requests."""
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
rex, pi = shutil.which("rex"), shutil.which("pi")
if not all((rex, pi, shutil.which("node"), shutil.which("zsh"))):
    raise SystemExit("This opt-in integration test requires Rex, Pi, Node.js, and Zsh on PATH.")
root = Path(tempfile.mkdtemp(prefix="rex-pi-e2e-", dir="/tmp"))
socket = root / "server.sock"
testhome = root / "home"
testhome.mkdir()
state = root / "private-state"
config = root / "rex.lua"
config.write_text("-- isolated restore test\n")
helper = testhome / ".local/bin/rex-restore-pi"
helper.parent.mkdir(parents=True)
shutil.copy2(ROOT / "bin/rex-restore-pi", helper)
bin = root / "bin"
bin.mkdir()
wrapper = bin / "pi"
extension = ROOT / "config/pi/extensions/rex-pi-restore/index.ts"
wrapper.write_text("#!/bin/sh\nexec " + shlex.quote(pi) + " --no-extensions -e " + shlex.quote(str(extension)) + " --no-tools --no-skills --no-context-files --no-prompt-templates \"$@\"\n")
wrapper.chmod(0o755)
agent = testhome / ".pi/agent"
agent.mkdir(parents=True)
for name in ("fd", "rg"):
    source = home / ".pi/agent/bin" / name
    if source.is_file():
        (agent / "bin").mkdir(exist_ok=True)
        shutil.copy2(source, agent / "bin" / name)
(agent / "settings.json").write_text(json.dumps({"defaultProvider": "idle-test", "defaultModel": "idle-only", "packages": []}))
(agent / "models.json").write_text(json.dumps({"providers": {"idle-test": {"baseUrl": "http://127.0.0.1:9/v1", "api": "openai-completions", "apiKey": "local-test-placeholder", "models": [{"id": "idle-only"}]}}}))
session = root / "exact Pi session.jsonl"
session.write_text(json.dumps({"type": "session", "version": 3, "id": str(uuid.uuid4()), "timestamp": "2026-11-10T00:00:00.000Z", "cwd": str(root)}) + "\n")
path = str(bin) + ":" + str(Path(shutil.which("node")).parent) + ":" + str(Path(rex).parent) + ":/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
startup = "".join("export " + key + "=" + shlex.quote(value) + "\n" for key, value in {
    "HOME": str(testhome), "PATH": path, "PI_CODING_AGENT_DIR": str(agent), "XDG_STATE_HOME": str(state),
    "REX_SERVER": "unix://" + str(socket),
}.items())
(testhome / ".zprofile").write_text(startup)
(testhome / ".zshrc").write_text(startup + ". " + shlex.quote(str(ROOT / "config/shell/rex-pi-restore.sh")) + "\n")
env = {k: v for k, v in os.environ.items() if not k.startswith("REX_")}
env.update({"ZDOTDIR": str(testhome), "PI_CODING_AGENT_DIR": str(agent), "XDG_STATE_HOME": str(state), "REX_SERVER": "unix://" + str(socket), "PATH": path})
args = [rex, "server", "run", "--listen", "unix://" + str(socket), "--state-dir", str(root / "server-state"), "--config", str(config)]
log = (root / "server.log").open("w")
server = None
sid = bid = None


def call(*parts, decode=True):
    result = subprocess.run([rex, "--server", "unix://" + str(socket), "--autostart=false", *parts], env=env, text=True, capture_output=True, timeout=10)
    if result.returncode:
        raise RuntimeError(result.stderr[-800:])
    return json.loads(result.stdout) if decode else result.stdout


def start():
    process = subprocess.Popen(args, env=env, stdout=log, stderr=log)
    try:
        for _ in range(150):
            if process.poll() is not None:
                raise RuntimeError("Isolated Rex exited")
            if socket.exists():
                try:
                    return process, call("whoami", "--json")
                except (RuntimeError, subprocess.TimeoutExpired):
                    pass
            time.sleep(0.05)
        raise RuntimeError("Isolated Rex failed to start")
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        raise


def await_record(instance):
    for _ in range(250):
        for path in (state / "rex-pi-restore").glob("*.json"):
            record = json.loads(path.read_text())
            if record["serverInstance"] == instance:
                return path, record
        time.sleep(0.05)
    raise RuntimeError("Pi did not register the expected server instance")


try:
    server, first = start()
    created = call("new", "pi-auto-restore-test", "--json", "--shell=none", "--", "/bin/zsh", "-i")
    sid = created["session_id"]
    bid = created["initial_windows"][0]["block_ids"][0]
    call("send", "-s", sid, "-b", bid, "--", "pi --session " + shlex.quote(str(session)), decode=False)
    call("send-key", "-s", sid, "-b", bid, "enter", decode=False)
    marker, original = await_record(first["instance_id"])
    server.terminate()
    server.wait(timeout=15)
    server = None
    assert marker.exists(), "Interrupted Pi marker was removed"
    server, second = start()
    _, resumed = await_record(second["instance_id"])
    assert resumed["piSessionFile"] == str(session)
    assert resumed["piPid"] != original["piPid"]
    assert resumed["rexBlock"] == bid
    records = [json.loads(line) for line in session.read_text().splitlines() if line.strip()]
    assert not any(record.get("type") == "message" for record in records), "Unexpected model/user turn"
    print("PASS: isolated restart automatically resumed the exact Pi session in the same pane, with no model/user turns.")
    call("send-key", "-s", sid, "-b", bid, "ctrl+d", decode=False)
    for _ in range(100):
        if not marker.exists():
            break
        time.sleep(0.05)
    assert not marker.exists(), "Normal Pi exit did not clear the restore marker"
    print("PASS: intentional Pi exit removed its restore registration.")
except BaseException:
    if server is not None and server.poll() is None and sid and bid:
        try:
            print("Isolated terminal diagnostic:\n" + call("capture", "-s", sid, "-b", bid, "--trim", decode=False)[-5000:])
        except Exception as error:
            print("Capture failed:", error)
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
