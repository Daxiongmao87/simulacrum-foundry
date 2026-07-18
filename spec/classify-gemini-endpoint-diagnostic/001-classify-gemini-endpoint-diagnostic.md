# Classify Gemini Endpoint Diagnostic

## Acceptance Criteria

- [x] The credentialed Gemini OpenAI-compatible endpoint probe is named and located as an opt-in maintainer diagnostic, not as a repository-owned integration test.
- [x] The diagnostic retains a direct argv-based package command and the same model-list, chat-completion, and tool-calling checks when a maintainer supplies `GEMINI_API_KEY`.
- [x] Repository CI, `test:local`, and every authoritative validation tier remain unchanged and require no Gemini credential.
- [x] No fake credential, skip, retry, silent success, or platform-side Simulacrum exception is introduced.

## Verification

- [x] Reproduce that `npm run diagnostic:gemini` is absent before the classification change.
- [x] Run the renamed diagnostic without a credential and confirm it reaches its precise missing-key failure rather than an unknown command or a pass.
- [x] Run the complete repository-owned offline validation gate.
- [x] Read package, CI, and contribution surfaces back and prove only the opt-in diagnostic names the credentialed endpoint probe.
- [x] Run the exact changed-file ESLint check and confirm the moved diagnostic introduces no finding.
- [ ] Re-run zero-touch repository analysis and confirm the derived authoritative contract requires no Gemini diagnostic credential.
