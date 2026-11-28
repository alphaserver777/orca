"""Prepare Professor IT instructions for Orca. DSH sources stay in their own deployment."""
from pathlib import Path
import hashlib
import os
import sys
import tempfile

PROFILE_RULES = (".codex/AGENTS.md", ".claude/CLAUDE.md", ".gemini/GEMINI.md", ".config/opencode/AGENTS.md")
OLD_CODEX_SHA = "7046e851d1e5dd6520bde03f8739198e0d682a7f5ef00994cd5960412354e244"
RULES = Path("/opt/professorit/orca/rules")
LONG_WORK = "Длительные поручения веди через задания и события Orca. После события проверь результат, журнал и ожидаемые артефакты. Для внешнего CI/CD проверь собственное событие завершения."


def workspace_rules(text):
    intro, sep, rest = text.partition("## Маршрут документации и документовед")
    if not sep or "AGENTS.md" not in intro:
        raise ValueError("Unknown workspace rules introduction")
    lines = rest.splitlines(keepends=True)
    start = next(i for i, line in enumerate(lines) if line.startswith("- Если работа длится долго,"))
    end = next(i for i in range(start + 1, len(lines)) if not lines[i].startswith("  "))
    del lines[start:end]
    text = "".join(lines)
    before, section = text.split("## Долгие операции\n", 1)
    _, after = section.split("\n## Безопасность и стиль", 1)
    return ("# Общий контекст «Профессор IT»\n\nЛокальный AGENTS.md проекта определяет правила для кода, проверок и выпуска.\n\n"
            + sep + before + "## Долгие операции\n\n" + LONG_WORK + "\n\n## Безопасность и стиль" + after)


def documentation_rules(text):
    header, intro, rest = text.split("\n\n", 2)
    if "WORKSPACE-AGENTS.md" not in intro:
        raise ValueError("Unknown documentation rules introduction")
    return header + "\n\n" + rest


def skill_rules(text):
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.startswith("Перед длительным запуском полностью прочитать") and "start-tmux-with-completion.sh" in line:
            lines[i] = LONG_WORK + " Сохрани журнал и status.json в рабочем каталоге.\n"
        elif line.startswith("До установки, ASR, рендера") and "start-tmux-with-completion.sh" in line:
            _, keep = line.split("Сохрани конечный сценарий", 1)
            evidence, _ = keep.split("Запуск только через", 1)
            _, external = line.split("Локальный submission", 1)
            lines[i] = "Перед длительным этапом проверь активные процессы. Сохрани конечный сценарий" + evidence + LONG_WORK + " Локальный submission" + external
    return "".join(lines)


def connect_profiles(home, common):
    """Run as the agent user. Never overwrite an unrelated global instruction file."""
    if not common.is_file() or not common.read_text().strip():
        raise ValueError("Shared rules file missing or empty")
    paths = [home / name for name in PROFILE_RULES]
    pending = []
    for path in paths:
        if path.is_symlink() and path.readlink() == common:
            continue
        if path.is_symlink() or path.exists():
            known = path == home / PROFILE_RULES[0] and not path.is_symlink() and path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == OLD_CODEX_SHA
            if not known:
                raise ValueError(f"Existing user rules require a deliberate merge: {path}")
        pending.append(path)
    for path in pending:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not os.path.lexists(path):
            path.symlink_to(common)
            continue
        with tempfile.TemporaryDirectory(dir=path.parent) as tmp:
            link = Path(tmp) / "rules"
            link.symlink_to(common)
            if path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != OLD_CODEX_SHA:
                raise ValueError(f"Instruction file changed during setup: {path}")
            os.replace(link, path)


if __name__ == "__main__":
    if sys.argv[1:] != ["--connect-profiles"] or os.geteuid() == 0:
        raise SystemExit("Use --connect-profiles as the Orca user")
    connect_profiles(Path.home(), RULES / "COMMON.md")
