"""Extract the 19 EAP columns from an MPP without persisting the binary file."""

import re


def _text(value):
    return "" if value is None else str(value).replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def _date(value):
    return "" if value is None else str(value)[:10].split("T")[0]


def _duration(task, properties):
    value = task.getDuration()
    if value is None:
        return ""
    from org.mpxj import TimeUnit
    return f"{float(value.convertUnits(TimeUnit.DAYS, properties).getDuration()):.2f}"


def _inherited_text(task, tasks_by_wbs, field):
    parts = _text(task.getWBS()).split(".")
    while parts:
        candidate = tasks_by_wbs.get(".".join(parts))
        value = _text(candidate.getText(field)) if candidate is not None else ""
        if value:
            return value
        parts.pop()
    return ""


def read_mpp(path):
    import jpype
    import mpxj  # registers the bundled JAR files before the JVM starts

    if not jpype.isJVMStarted():
        jpype.startJVM(convertStrings=True)
    from org.mpxj.reader import UniversalProjectReader

    project = UniversalProjectReader().read(path)
    tasks = [task for task in project.getTasks() if _text(task.getName()) and _text(task.getWBS())]
    roots = [task for task in tasks if _text(task.getWBS()) == "0"]
    if len(roots) != 1 or not re.search(r"\bOS\s*[-_.]?\s*\d+\b", _text(roots[0].getName()), re.I):
        raise ValueError("O Project precisa ter uma tarefa raiz 0 identificada como OS.")

    tasks_by_wbs = {_text(task.getWBS()): task for task in tasks}
    rows = []
    for task in tasks:
        wbs = _text(task.getWBS())
        if not re.fullmatch(r"\d+(?:\.\d+)*", wbs):
            continue
        percent = task.getPercentageComplete()
        percent_text = "" if percent is None else f"{float(percent):g}"
        predecessors = ",".join(_text(relation.getPredecessorTask().getWBS()) for relation in task.getPredecessors())
        discipline = _inherited_text(task, tasks_by_wbs, 3)
        building = _inherited_text(task, tasks_by_wbs, 5)
        rows.append([
            "", "", percent_text, wbs, _text(task.getName()), _duration(task, project.getProjectProperties()),
            _date(task.getBaselineStart()), _date(task.getBaselineFinish()), predecessors, "",
            _text(task.getResourceNames()), _date(task.getActualStart()), _date(task.getFinish()), "",
            discipline, discipline, building,
            _text(task.getText(2)), _text(task.getText(4)),
        ])
    if len(rows) < 2:
        raise ValueError("O Project não contém tarefas suficientes para uma EAP.")
    return rows
