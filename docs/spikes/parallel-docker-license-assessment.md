# Spike: Parallel Docker FoundryVTT License Assessment

Issue: #39  
Milestone: Docker-based Integration Testing Infrastructure

## 1. Executive Summary (Draft)
This document will assess whether we can legally and technically run multiple concurrent FoundryVTT instances (containers) under a single commercial license for automated CI integration testing (multi-version + multi-system matrix). Outcome will guide implementation of Issue #8 (docker-compose / parallel matrix infra).

## 2. Scope & Goals
- Determine license compliance boundaries
- Identify technical constraints (activation, session limits)
- Recommend a compliant architecture (parallel vs serialized)
- Define fallback if parallel execution is disallowed

Out of Scope: Performance tuning, test authoring, non-Docker execution modes.

## 3. Key Questions
(From issue body – to be validated / expanded)
1. EULA allowance of simultaneous instances used privately for CI
2. Restrictions on automation (headless/Puppeteer)
3. Redistribution / image layering implications (ephemeral builds)
4. Safe patterns for handling purchased ZIP artifacts
5. Need for concurrency throttling / license key gating
6. Technical detection of duplicate sessions by Foundry core

## 4. Research Plan
- Retrieve latest EULA from official FoundryVTT site (URL to record)
- Extract and quote relevant clauses (Installation, Restrictions, Redistribution, Automation if any, Derivative Works)
- Classify each clause: Permissive / Restrictive / Ambiguous relative to our use-case
- Run empirical test: start N=2 containers with same license; capture logs for anomalies
- (Optional) Escalate ambiguous interpretations via community forum or support ticket (NOT included in repository; only note need)

## 5. Compliance Considerations (Initial Thoughts)
- Avoid committing proprietary ZIPs or baked images to public registries
- Build images only in ephemeral CI jobs from locally provided (privately stored) ZIP
- Inject license via secret env var; never log full key
- Potential model: one container at a time for world bootstrap; subsequent containers reuse prepared volume snapshot (if allowed)

## 6. Parallelization Architectural Options (Preliminary)
| Option | Description | Pros | Cons | License Risk |
|--------|-------------|------|------|--------------|
| Serial Orchestrator | One container boots/tests per version sequentially | Simplest, safest | Slow total time | Low |
| Job Matrix (CI) | Separate jobs each spin one container | Scales well | Concurrent license use | TBD |
| docker-compose Parallel | Single host runs multiple containers simultaneously | Fast feedback | Port mapping complexity | TBD |
| Warm Pool + Queue | Maintain limited pool (e.g., 2) to cap concurrency | Balanced speed/compliance | Complexity | Low/Medium |

## 7. Data to Capture in Prototype
- Startup logs (license validation lines)
- Any warnings/errors about duplicate use
- Memory/CPU footprint per container (for scaling estimate)
- Time to ready state per container under parallel load

## 8. Risk Matrix (Draft Placeholder)
| Risk | Category | Impact | Likelihood | Mitigation |
|------|----------|--------|------------|------------|
| License violation via simultaneous use | Legal | High | ? | Serialize or seek clarification |
| Leakage of license key in logs | Security | High | Medium | Mask key, log first 4 chars only |
| Increased flakiness due to resource contention | Technical | Medium | Medium | Limit concurrency, resource requests |

## 9. Deliverables Checklist
- [ ] EULA sourced URL recorded
- [ ] Clause excerpts + interpretations
- [ ] Empirical parallel launch test results
- [ ] Compliance recommendation (Allowed / Conditional / Not Allowed)
- [ ] Proposed architecture diagram summary
- [ ] Fallback & mitigation plan
- [ ] Next-step implementation tasks for Issue #8

## 10. Preliminary Next Steps (After Spike)
(To populate once findings are in.)
- Implement chosen orchestration pattern
- Update CI workflow YAML
- Introduce concurrency guard if required
- Extend runner to support dynamic port allocation

---
Document initialized. Populate sections upon completing research tasks.
