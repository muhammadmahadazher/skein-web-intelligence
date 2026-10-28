from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
REACT_STACK = {"react", "react-dom", "react-server-dom-webpack", "@types/react", "@types/react-dom"}


def test_react_group_is_complete_and_disjoint() -> None:
    config = yaml.safe_load((ROOT / ".github/dependabot.yml").read_text(encoding="utf-8"))
    npm = next(item for item in config["updates"] if item["package-ecosystem"] == "npm")
    groups = npm["groups"]
    assert set(groups["react-stack"]["patterns"]) == REACT_STACK
    assert "dependency-type" not in groups["react-stack"]
    assert set(groups["react-security"]["patterns"]) == REACT_STACK
    assert groups["react-security"]["applies-to"] == "security-updates"
    for name in ("web-runtime", "web-tooling"):
        assert set(groups[name]["exclude-patterns"]) >= REACT_STACK


def test_python_updates_use_uv_lockfile_support() -> None:
    config = yaml.safe_load((ROOT / ".github/dependabot.yml").read_text(encoding="utf-8"))
    python = [item for item in config["updates"] if item["directory"] == "/services/control-plane"]
    assert len(python) == 1
    assert python[0]["package-ecosystem"] == "uv"
    assert (ROOT / "services/control-plane/uv.lock").is_file()
    groups = python[0]["groups"]
    assert "asyncpg-stubs" in groups["python-typing"]["patterns"]
    assert "asyncpg-stubs" in groups["python-dependencies"]["exclude-patterns"]
    assert "update-types" not in groups["python-typing"]
