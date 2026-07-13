#!/usr/bin/env python3
"""Run one real broker -> isolated Foundry -> read-only worker smoke cycle."""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
import uuid
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True, choices=("13.351", "14.364"))
    parser.add_argument("--agentic-delivery-root", type=Path, required=True)
    parser.add_argument(
        "--evidence-root",
        type=Path,
        default=REPOSITORY_ROOT / "artifacts" / "deployment" / "foundry-live",
    )
    args = parser.parse_args()
    source = REPOSITORY_ROOT.resolve(strict=True)
    platform_root = args.agentic_delivery_root.resolve(strict=True)
    sys.path.insert(0, str(platform_root / "src"))
    from agentic_delivery.foundry_broker import (
        FoundryBrokerExchange,
        load_foundry_broker_policy,
    )
    from agentic_delivery.foundry_provider import (
        FoundryProvider,
        FoundryProviderConfiguration,
    )
    image = _platform_foundry_image(platform_root)
    operation_root = Path(tempfile.mkdtemp(prefix=f"adp-foundry-live-{args.version}-"))
    os.chmod(operation_root, 0o700)
    request = None
    provider = None
    cleanup_safe = True
    print(f"[live-smoke] current-operation-root={operation_root}")
    try:
        state = operation_root / "state"
        exchange = operation_root / "broker-exchange"
        sessions = operation_root / "broker-sessions"
        archives = operation_root / "stores" / "archives"
        systems = operation_root / "stores" / "systems"
        artifacts = state / "artifacts"
        for path in (
            state,
            exchange / "requests",
            exchange / "receipts",
            sessions,
            archives,
            systems,
            artifacts,
        ):
            path.mkdir(parents=True, exist_ok=True, mode=0o700)
            os.chmod(path, 0o700)

        key_path = operation_root / "broker-hmac.key"
        key_path.write_bytes(os.urandom(64))
        os.chmod(key_path, 0o600)
        license_path = operation_root / "foundry-license.key"
        license_path.write_text(_license_key(source) + "\n", encoding="utf-8")
        os.chmod(license_path, 0o600)

        archive_source = source / "vendor/foundry" / f"FoundryVTT-Node-{args.version}.zip"
        archive_target = archives / archive_source.name
        shutil.copyfile(archive_source, archive_target)
        os.chmod(archive_target, 0o400)
        system_target = systems / args.version / "dnd5e"
        shutil.copytree(source / ".foundry-system-cache" / args.version / "dnd5e", system_target)
        _make_tree_read_only(systems)
        os.chmod(archives, 0o500)

        job_id = str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        worktree = state / "worktrees" / job_id
        _copy_clean_worktree(source, worktree)

        base = load_foundry_broker_policy(platform_root)
        policy = dataclasses.replace(
            base,
            configured=True,
            exchange_root=exchange,
            session_root=sessions,
            hmac_key_file=key_path,
            port_min=32100,
            port_max=32999,
            provision_timeout_seconds=300,
            cleanup_timeout_seconds=120,
        )
        configuration = FoundryProviderConfiguration(
            broker_id="agentic-delivery-live-smoke",
            broker_version="1.0.0",
            state_root=state,
            archive_root=archives,
            system_cache_root=systems,
            license_key_file=license_path,
            container_image=image,
            activation_network="bridge",
            poll_interval_seconds=1,
            capability_ttl_seconds=60,
            system_sources={
                "dnd5e": "https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json"
            },
        )
        provider = FoundryProvider(
            project_root=platform_root,
            policy=policy,
            configuration=configuration,
        )
        provider.preflight()
        provider.publish_capability()
        broker = FoundryBrokerExchange(
            project_root=platform_root,
            state_root=state,
            artifact_root=artifacts,
            policy=policy,
        )
        run = broker.prepare_provision(
            job_id=job_id,
            request_id=request_id,
            profile_key="simulacrum-foundry-v1",
            matrix={
                "foundry_version": args.version,
                "game_system": "dnd5e",
                "browser": "chromium",
            },
        )
        request = provider._read_request(run.request_path)
        provider._provision(request)
        artifact_directory = artifacts / job_id / "jenkins" / request_id
        artifact_directory.mkdir(parents=True, mode=0o700)
        session, _ = broker.accept_provision(run, artifact_directory=artifact_directory)

        output = operation_root / "worker-output"
        output.mkdir(mode=0o700)
        completed = subprocess.run(
            _worker_argv(
                worktree=worktree,
                modules=source / "node_modules",
                output=output,
                session_file=session.session_file,
                endpoint=session.endpoint,
                version=args.version,
                run_id=run.run_id,
                network=policy.network,
                image=image,
            ),
            check=False,
            capture_output=True,
            text=True,
            timeout=900,
        )
        (operation_root / "worker.stdout.log").write_text(completed.stdout, encoding="utf-8")
        (operation_root / "worker.stderr.log").write_text(completed.stderr, encoding="utf-8")
        if completed.returncode != 0:
            print("[live-smoke] worker-stdout-tail:")
            print("\n".join(completed.stdout.splitlines()[-120:]))
            print("[live-smoke] worker-stderr-tail:")
            print("\n".join(completed.stderr.splitlines()[-120:]))
            raise RuntimeError(
                f"Foundry worker failed ({completed.returncode}); evidence root={operation_root}"
            )
        _verify_worker_evidence(output)
        evidence_directory = _preserve_success_evidence(
            output=output,
            evidence_root=args.evidence_root.resolve(),
            version=args.version,
            run_id=run.run_id,
            worker_exit=completed.returncode,
            worker_image=image,
        )

        broker.prepare_cleanup(session)
        cleanup_request = provider._read_request(
            exchange / "requests" / f"{run.run_id}.cleanup.json"
        )
        provider._cleanup(cleanup_request)
        broker.accept_cleanup(session, artifact_directory=artifact_directory)
        if run.run_root.exists() or session.session_file.exists() or run.port_lock_path.exists():
            raise RuntimeError("broker did not release exact run/session/port state after receipt")
        print(
            json.dumps(
                {
                    "status": "passed",
                    "foundry_version": args.version,
                    "run_id": run.run_id,
                    "worker_exit": completed.returncode,
                    "evidence_directory": str(evidence_directory),
                    "artifact_categories": sorted(
                        path.name
                        for path in output.iterdir()
                        if path.is_dir()
                    ),
                },
                sort_keys=True,
            )
        )
        return 0
    except BaseException as error:
        print(f"[live-smoke] failure={type(error).__name__}: {error}")
        traceback.print_exc()
        if request is not None and provider is not None:
            try:
                logs = subprocess.run(
                    ["docker", "logs", "--tail", "200", f"foundry-{request['run_id']}"],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                print("[live-smoke] owned-container-logs:")
                print(logs.stdout)
                print(logs.stderr)
            except BaseException as log_error:
                print(f"[live-smoke] could not inspect owned container logs: {log_error}")
            try:
                provider._stop_owned_container(request, allow_absent=True)
            except BaseException as cleanup_error:
                cleanup_safe = False
                print(
                    "[live-smoke] preserving operation root because exact container cleanup "
                    f"could not be proven: {cleanup_error}"
                )
        return 1
    finally:
        if cleanup_safe:
            print(f"[live-smoke] verified cleanup target={operation_root}")
            _make_owned_tree_writable(operation_root)
            shutil.rmtree(operation_root)


def _license_key(source: Path) -> str:
    for line in (source / "tests/e2e/.env.test").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("FOUNDRY_LICENSE_KEY="):
            value = line.split("=", 1)[1].strip().strip('"\'')
            if value:
                return value
    raise RuntimeError("local Foundry license prerequisite is unavailable")


def _make_tree_read_only(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        os.chmod(path, 0o500 if path.is_dir() else 0o400)
    os.chmod(root, 0o500)


def _make_owned_tree_writable(root: Path) -> None:
    for path in (root, *root.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"refusing cleanup of symbolic link in owned root: {path}")
        if path.is_dir():
            os.chmod(path, 0o700)
        elif path.is_file():
            os.chmod(path, 0o600)
        else:
            raise RuntimeError(f"refusing cleanup of non-file object in owned root: {path}")


def _copy_clean_worktree(source: Path, target: Path) -> None:
    ignored = shutil.ignore_patterns(
        ".git",
        ".codex",
        "node_modules",
        "vendor",
        ".foundry-*",
        ".foundry-system-cache",
        "artifacts",
        "dist",
        "reports",
        "test-results",
        "*.log",
    )
    shutil.copytree(source, target, ignore=ignored)
    env_file = target / "tests/e2e/.env.test"
    if env_file.exists():
        env_file.unlink()
    (target / "node_modules").mkdir(mode=0o700)


def _worker_argv(
    *,
    worktree: Path,
    modules: Path,
    output: Path,
    session_file: Path,
    endpoint: str,
    version: str,
    run_id: str,
    network: str,
    image: str,
) -> list[str]:
    uid = os.geteuid()
    gid = os.getegid()
    return [
        "docker",
        "run",
        "--rm",
        "--name",
        f"adp-live-worker-{run_id}",
        "--network",
        network,
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "512",
        "--memory",
        "8g",
        "--cpus",
        "4.0",
        "--user",
        f"{uid}:{gid}",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=2g",
        "--mount",
        f"type=bind,src={worktree},dst=/workspace,readonly",
        "--mount",
        f"type=bind,src={modules},dst=/workspace/node_modules,readonly",
        "--mount",
        f"type=bind,src={output},dst=/output",
        "--mount",
        f"type=bind,src={session_file},dst=/run/secrets/foundry-session.json,readonly",
        "--workdir",
        "/workspace",
        "--env",
        "ADP_FOUNDRY_SESSION_FILE=/run/secrets/foundry-session.json",
        "--env",
        f"ADP_FOUNDRY_ENDPOINT={endpoint}",
        "--env",
        "ADP_ARTIFACT_DIR=/output",
        "--env",
        f"ADP_FOUNDRY_VERSION={version}",
        "--env",
        "ADP_GAME_SYSTEM=dnd5e",
        "--env",
        "ADP_BROWSER=chromium",
        "--env",
        "ADP_TEST_OUTCOME_FILE=/output/test-outcomes/foundry_smoke.json",
        "--env",
        "ADP_TEST_OUTCOME_SCHEMA_VERSION=1",
        image,
        "npm",
        "run",
        "test:foundry:smoke",
    ]


def _platform_foundry_image(platform_root: Path) -> str:
    provider = json.loads(
        (platform_root / "config/foundry/provider.json").read_text(encoding="utf-8")
    )
    workers = json.loads(
        (platform_root / "config/workers/images.json").read_text(encoding="utf-8")
    )
    worker = next(
        item for item in workers["workers"] if item["worker_class"] == "foundry-e2e"
    )
    image = str(provider["container_image"])
    if image != worker["image_digest"] or "@sha256:" not in image:
        raise RuntimeError("platform Foundry provider and worker image pins differ")
    return image


def _verify_worker_evidence(output: Path) -> None:
    required = {"screenshots", "video", "trace", "console", "dom", "accessibility"}
    missing = sorted(
        category
        for category in required
        if not (output / category).is_dir() or not any((output / category).iterdir())
    )
    if missing:
        raise RuntimeError("worker omitted evidence categories: " + ", ".join(missing))
    outcome = json.loads(
        (output / "test-outcomes/foundry_smoke.json").read_text(encoding="utf-8")
    )
    if not (
        outcome["status"] == "passed"
        and outcome["discovered"] >= 1
        and outcome["passed"] == outcome["discovered"]
        and all(
            outcome[name] == 0
            for name in (
                "failed",
                "skipped",
                "quarantined",
                "focused",
                "expected_failures",
                "retry_count",
            )
        )
    ):
        raise RuntimeError("worker test outcome does not satisfy the authoritative gate")


def _preserve_success_evidence(
    *,
    output: Path,
    evidence_root: Path,
    version: str,
    run_id: str,
    worker_exit: int,
    worker_image: str,
) -> Path:
    destination = evidence_root / version / run_id
    if destination.exists() or destination.is_symlink():
        raise RuntimeError(f"refusing to overwrite live evidence path: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copytree(output, destination / "worker-output")
    categories = {
        path.name: len(tuple(path.iterdir()))
        for path in output.iterdir()
        if path.is_dir()
    }
    (destination / "live-summary.json").write_text(
        json.dumps(
            {
                "schema_version": "v1",
                "status": "passed",
                "foundry_version": version,
                "game_system": "dnd5e",
                "browser": "chromium",
                "run_id": run_id,
                "worker_exit": worker_exit,
                "worker_image": worker_image,
                "broker_network": "agentic-delivery-foundry-broker",
                "host_published_ports": [],
                "artifact_counts": categories,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return destination


if __name__ == "__main__":
    raise SystemExit(main())
