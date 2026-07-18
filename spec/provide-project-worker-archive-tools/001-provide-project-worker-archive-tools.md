# Provide Project Worker Archive Tools

Issue: https://github.com/Daxiongmao87/simulacrum-foundry/issues/190

This item restores the target-owned execution-image contract previously materialized at `.agentic-delivery/Dockerfile`; it does not change the repository's authoritative package command or replace `zip`/`unzip` with a different implementation.

## Acceptance Criteria

- [x] A tracked target-owned Dockerfile uses an immutable Node 24 base and installs the `zip` and `unzip` executables required by `package_module` and the package regression.
- [ ] Repository analysis selects that exact Dockerfile instead of the generic platform image, and the governed image identity remains bound to the target source tree and contract digest.
- [x] The governed worker can execute Node, `zip`, and `unzip` as its non-root runtime identity without weakening its read-only, capability, or network policy.
- [ ] Exact-head qualification passes `package_module` without changing, suppressing, or reclassifying the authoritative command.

## Verification

- [x] Preserve the governed exact-head reproduction: request `e5a36609-8502-4878-95d5-b50cd9192b90` reaches `package_module` and fails with `/bin/sh: 1: zip: not found` in the generic project image.
- [x] Build the target Dockerfile and smoke-test Node 24, `zip`, and `unzip` under the governed non-root/read-only worker envelope.
- [x] Run the repository-owned offline validation gate in the target image with no skips, retries, or failures.
- [ ] Open, review, merge, and read back a target pull request, then rerun governed exact-head qualification past `package_module`.
