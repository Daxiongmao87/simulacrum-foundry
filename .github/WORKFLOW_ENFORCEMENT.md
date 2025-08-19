# WORKFLOW ENFORCEMENT: STOP IGNORING ISSUE REQUIREMENTS

## ROOT CAUSE: I DON'T READ ISSUE DESCRIPTIONS CAREFULLY

The problem is NOT that I need checklists - **I IGNORE THE CHECKLISTS**.

The problem is that **I SCAN ISSUES TOO QUICKLY AND MISS CRITICAL WARNINGS**.

## MANDATORY STEP 1 ENFORCEMENT: SLOW DOWN AND READ

**BEFORE DOING ANYTHING ELSE:**

1. **COPY THE ENTIRE ISSUE DESCRIPTION** into my analysis
2. **SEARCH FOR 🚨 WARNINGS** and highlight them
3. **IDENTIFY THE EXACT DELIVERABLE TYPE** required
4. **QUOTE THE SPECIFIC REQUIREMENTS** word-for-word

## STEP 1 TEMPLATE:

```
ISSUE ANALYSIS - MANDATORY SLOW READ:

ISSUE TITLE: [exact title]

🚨 WARNING DETECTION:
[Search for 🚨 symbols and copy ALL warning text]

DELIVERABLE TYPE REQUIRED:
□ Bootstrap Helper Method (modify ConcurrentDockerTestRunner class)
□ Integration Test File (create .test.js file)
□ Other: [specify]

SPECIFIC REQUIREMENTS (QUOTED):
"[exact quote from issue]"

FILE TO MODIFY/CREATE:
[exact file path from issue]

FORBIDDEN ACTIONS (if any):
[list what the issue says NOT to do]
```

## ENFORCEMENT: AGENT INSTRUCTIONS MUST MATCH ISSUE TYPE

**IF BOOTSTRAP HELPER DETECTED:**
- Agent instruction MUST include: "MODIFY tests/helpers/concurrent-docker-test-runner.js"
- Agent instruction MUST include: "DO NOT CREATE .test.js FILES"

**IF INTEGRATION TEST DETECTED:**
- Agent instruction MUST include: "CREATE tests/integration/*.test.js"
- Agent instruction MUST include: "DO NOT MODIFY ConcurrentDockerTestRunner class"

## STEP 6 ENFORCEMENT: VERIFY CORRECT DELIVERABLE TYPE

**VALIDATION COMMANDS:**

For Bootstrap Helper Issues:
```bash
# 1. Verify NO test files created
find tests/integration -name "*.test.js" -newer /tmp/before_agent | wc -l
# Should be 0

# 2. Verify helper method added
git diff --name-only | grep "concurrent-docker-test-runner.js"
# Should show the helper file
```

For Integration Test Issues:
```bash
# 1. Verify test file created
find tests/integration -name "*.test.js" -newer /tmp/before_agent
# Should show new test file

# 2. Verify test syntax works
node -c tests/integration/*.test.js
# Should not error
```

## IMMEDIATE REJECTION TRIGGERS:

1. **Issue says "BOOTSTRAP HELPER"** → Agent created .test.js file = **REJECT**
2. **Issue says "INTEGRATION TEST"** → Agent only modified helper class = **REJECT**
3. **Issue has 🚨 warning** → Warning ignored in deliverable = **REJECT**
4. **File path specified in issue** → Different file modified = **REJECT**

## COMMIT PREVENTION:

**NEVER COMMIT IF:**
- Wrong deliverable type created
- Issue warnings ignored
- Specified file not modified
- Tests don't pass syntax check
