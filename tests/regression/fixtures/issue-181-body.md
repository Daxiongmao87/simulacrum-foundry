## Summary

Allow the primary Simulacrum agent to delegate multiple independent, read-only tasks to isolated child agents, then reconcile their findings into one final response.

This should be implemented as an agent-facing delegation tool rather than as a handoff or a separate user conversation.

## Motivation

Broad campaign-analysis tasks can often be divided into independent workstreams. For example, an audit could inspect journals, actors, and scenes separately.

Running those workstreams in isolated contexts can improve coverage and reduce wall time without allowing multiple agents to mutate shared Foundry state.

## Proposed behavior

Add a delegation tool, provisionally named `delegate_read_tasks`, that:

- accepts one or more bounded task descriptions;
- starts an ephemeral child context for each task;
- runs children concurrently up to a configurable limit;
- gives children only a positive allowlist of read-only document, schema, folder, and asset tools;
- returns structured findings to the primary agent;
- leaves final synthesis and all user-facing communication to the primary agent.

Initial concurrency should be conservatively capped, such as two active children.

Each child result should include:

```json
{
  "status": "completed | partial | failed | cancelled | budget_exhausted",
  "summary": "string",
  "findings": [],
  "evidence": [],
  "warnings": []
}
```

## Safety and lifecycle requirements

- Children must not receive document mutation, ownership, macro, JavaScript, or recursive-delegation tools.
- The read-only boundary must be enforced during execution, not only through prompt instructions.
- Child conversation and run state must be isolated from the persisted parent conversation.
- Each child must have model-call, tool-call, token, and time limits.
- Cancelling the parent operation must cancel every active child.
- A parent operation must not report completion while any child remains active.
- Child failures must not discard successful sibling results.
- The primary agent must revalidate relevant documents before performing any later mutation.

## Acceptance criteria

- [ ] The primary agent can delegate at least two independent read-only tasks in one tool invocation.
- [ ] Delegated tasks execute concurrently up to the configured limit.
- [ ] Each child receives an isolated, ephemeral context.
- [ ] Each child receives only the configured read-only tool allowlist.
- [ ] Attempts to invoke non-allowlisted tools are rejected before execution and produce no Foundry mutation.
- [ ] Child results follow the documented structured-result contract.
- [ ] One failed or exhausted child does not discard successful sibling results.
- [ ] The primary agent receives all settled results and remains responsible for the final response.
- [ ] Parent cancellation terminates all active children and leaves no child running.
- [ ] Delegation uses the existing configured OpenAI-compatible provider through `AIClient`.
- [ ] Normal single-agent behavior is unchanged when delegation is not invoked.
- [ ] A controlled read-only campaign audit records coverage, elapsed time, token use, and cancellation behavior against the single-agent baseline.

## Non-goals

- Child document writes or deletions
- Child macro or JavaScript execution
- Conversation handoffs
- Direct child-to-user communication
- Persistent child conversations
- Recursive child spawning
- Peer-to-peer child coordination
- A user-facing enablement toggle before evaluation

## Related work

- Resolve the non-terminal tool-loop continuation defect in #178.
- Track concurrent execution of independent model-issued tool calls separately; this issue only requires bounded concurrency within the delegation capability.
