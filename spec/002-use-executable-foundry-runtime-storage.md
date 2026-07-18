# Use Executable Foundry Runtime Storage

## Acceptance Criteria

- [x] Governed Foundry setup selects an executable, operation-owned external runtime root and rejects a writable but non-executable requested root.
- [x] The exact correction head reaches its intended Foundry 13.351/dnd5e world for the common accessibility and sidebar-smoke cases.
- [x] The packaged module requests no missing demo asset or optional build metadata; the sidebar smoke reports no unexpected browser error and explicitly classifies an unavailable optional model endpoint.
- [x] A missing world or unavailable broker fails with a precise readiness error, and every success or failure cleans its owned Foundry and Chromium resources.
- [x] Teardown proves the owned Foundry listener has closed before reporting the port reusable.
- [x] Global-setup failures remove the governed runtime root and retained logs expose only logical distribution identity, never the deployment mount path.
- [x] Governed tests read deployment-mounted environment, license, and distribution files directly; no credential or licensed byte is staged in a Git worktree, committed content, or retained browser artifact.

## Verification

- [x] Reproduce the exact current-head 13.351/dnd5e failure and retain its setup, browser, Foundry-log, and cleanup evidence.
- [x] Add a failing unit regression for a writable, non-executable requested runtime root before changing setup behavior.
- [x] Add failing unit regressions for direct external inputs, unsafe input paths, executable runtime selection, and owned cleanup before changing setup behavior.
- [x] Pass the focused runtime-root regression and the complete repository-owned unit tier.
- [x] Run the 13.351/dnd5e accessibility and sidebar-smoke cases first, including precise unavailable-world/broker and cleanup checks.
- [x] Add failing regressions for listener polling, global-setup failure cleanup, and distribution-path redaction before correcting the review findings.
- [x] Pass the review regression set and complete repository-owned unit tier after correcting every review finding.
- [x] Reproduce the missing demo-asset and optional-build-metadata requests, then pass the existing zero-unexpected-browser-error sidebar smoke.
