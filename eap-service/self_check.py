from pathlib import Path

from mpp_converter import _inherited_text


class Task:
    def __init__(self, wbs, values=None):
        self.wbs = wbs
        self.values = values or {}

    def getWBS(self):
        return self.wbs

    def getText(self, field):
        return self.values.get(field)


root = Task("0")
parent = Task("1", {3: "ARQ", 5: "2"})
child = Task("1.1")
tasks = {task.wbs: task for task in (root, parent, child)}
assert _inherited_text(child, tasks, 3) == "ARQ"
assert _inherited_text(child, tasks, 5) == "2"

source = Path(__file__).with_name("app.py").read_text(encoding="utf-8")
assert 'MAX_MPP_BYTES = 30 * 1024 * 1024' in source
assert 'signature != MPP_SIGNATURE' in source
assert 'index >= MAX_CHUNKS' in source
assert 'data["rowCount"] + len(rows) > MAX_ROWS' in source
assert 'current.update_time != snap.update_time' in source
assert 'data.get("status") == "published"' in source
assert 'EAP_CONVERT_ONLY' in source
assert '@app.get("/health")' in source

converter = Path(__file__).with_name("mpp_converter.py").read_text(encoding="utf-8")
assert 'getPredecessorTask().getWBS()' in converter
assert 'getPredecessorTask().getID()' not in converter

print("eap-service: OK")
