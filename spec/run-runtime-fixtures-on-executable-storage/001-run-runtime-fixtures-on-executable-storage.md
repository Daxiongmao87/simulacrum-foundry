# Run Runtime Fixtures on Executable Storage

Issue: https://github.com/Daxiongmao87/simulacrum-foundry/issues/191

This item changes only test-fixture placement. Production must continue to reject a non-executable governed Foundry runtime root as established by `spec/use-executable-foundry-runtime-storage/001-use-executable-foundry-runtime-storage.md`.

## Acceptance Criteria

- [x] Runtime-ownership tests that exercise real executable probes allocate their synthetic artifact roots on repository-owned executable storage rather than the governed worker's `noexec` `/tmp`.
- [x] Each test removes its exact temporary operation root; tests do not weaken, bypass, or mock the production executable-directory probe.
- [x] The same tests pass in the target-owned image under the governed non-root/read-only-root envelope while `/tmp` remains `noexec`.

## Verification

- [x] Reproduce the governed-image failure: the unit tier reports 32 passes, 3 executable-root failures, and zero skips when `/tmp` is unavailable for executable runtime content.
- [x] Run the focused global-setup and teardown ownership tests in the governed worker envelope.
- [x] Run the repository-owned offline validation gate in the target image with no skips, retries, or failures.
- [ ] Include the fixture correction in a reviewed target pull request and read back the merged default-branch tree.
