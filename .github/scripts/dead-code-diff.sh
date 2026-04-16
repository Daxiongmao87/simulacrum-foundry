#!/usr/bin/env bash
# Run knip on HEAD and on the PR base, fail only on findings newly introduced
# by this PR. This catches the case where editing file A makes a different
# file B newly dead — knip reports B, this diff catches it even though the PR
# didn't touch B directly.
#
# Distinguishes knip runtime/config errors (tool failure) from findings
# (exit 1 with a counted section header). A runtime error on HEAD fails CI;
# a runtime error on base emits a warning and passes, because we can't
# compute a meaningful diff but the PR itself isn't at fault.
#
# When the PR changes package.json / package-lock.json, the base worktree gets
# a fresh `npm ci` so baseline findings reflect the base lockfile state, not
# HEAD's dependency graph.
#
# Usage: dead-code-diff.sh <base_sha>

set -Eeuo pipefail

BASE_SHA="${1:?base SHA required}"
HEAD_OUT=/tmp/knip-head.out
BASE_OUT=/tmp/knip-base.out
WORKTREE=/tmp/knip-base-tree

cleanup() {
  if [ -d "$WORKTREE" ]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
  fi
}
trap cleanup EXIT

# Knip findings always come under a counted section header like
# `Unused exports (76)`, `Unresolved imports (1)`, or `Configuration hints (2)`.
# Rather than whitelist section prefixes (knip adds/renames them across
# versions), match any capitalized header ending in a `(N)` count suffix.
# Runtime/config errors like "Configuration file load error" do NOT match
# because they lack the count suffix, so this cleanly separates findings
# from tool failures.
FINDING_HEADER_RE='^[A-Z][A-Za-z][A-Za-z ]*\([0-9]+\)[[:space:]]*$'

run_knip() {
  local dir="$1" out="$2" rc=0
  # knip exits non-zero on findings; don't let errexit abort us here.
  set +e
  (cd "$dir" && npm run --silent dead-code) > "$out" 2>&1
  rc=$?
  set -e
  return $rc
}

looks_like_findings() {
  grep -qE "$FINDING_HEADER_RE" "$1"
}

# Normalize knip output to a stable set of identifiers, per-line. We only
# keep lines that appear *inside* a findings section (between a `Name (N)`
# header and the next blank line), because knip's stdout can be polluted
# by unrelated logs emitted while loading analyzed configs (e.g. a
# top-level console.log in tests/e2e/playwright.config.js). Lines outside
# any section are discarded, so stray log lines cannot be misinterpreted
# as new findings by `comm`.
#
# Within a section:
# - strip :line:col locators (positions shift with edits)
# - collapse internal whitespace (knip's text reporter pads columns to
#   the widest row in the current run, so adding/removing one long
#   identifier re-pads unchanged rows)
# - trim leading/trailing whitespace
normalize() {
  awk '
    /^[A-Z][A-Za-z][A-Za-z ]*\([0-9]+\)[[:space:]]*$/ { in_section = 1; next }
    /^[-—─=]+$/ { next }
    /^[[:space:]]*$/ { in_section = 0; next }
    in_section {
      gsub(/:[0-9]+:[0-9]+/, "")
      gsub(/[[:space:]]+/, " ")
      sub(/^ /, "")
      sub(/ +$/, "")
      print
    }
  ' "$1" | sort -u
}

# --- HEAD ---
# Capture run_knip's real exit code. `|| true` would mask it to 0 under
# errexit, silently disabling the gate.
HEAD_RC=0
run_knip "$GITHUB_WORKSPACE" "$HEAD_OUT" || HEAD_RC=$?
if [ "$HEAD_RC" -eq 0 ]; then
  echo "knip: no findings on HEAD"
  exit 0
fi
if ! looks_like_findings "$HEAD_OUT"; then
  echo "::error::knip appears to have failed with a runtime/config error on HEAD"
  cat "$HEAD_OUT"
  exit 2
fi

# --- BASE ---
git worktree add --detach "$WORKTREE" "$BASE_SHA" >/dev/null

# If dependency manifests changed, the base worktree needs its own install to
# reflect base's lockfile; otherwise we reuse HEAD's node_modules for speed.
DEPS_CHANGED=0
if ! git diff --quiet "$BASE_SHA" HEAD -- package.json package-lock.json; then
  DEPS_CHANGED=1
fi

if [ "$DEPS_CHANGED" = "1" ]; then
  echo "Dependency manifests changed — installing base lockfile deps in worktree."
  # A transient registry/install failure on the base side is not the PR's
  # fault; degrade to warn-and-pass, matching the base-knip-runtime-error
  # fallback below. Without this, `set -e` would abort before we can reach
  # the later baseline fallback.
  INSTALL_RC=0
  (cd "$WORKTREE" && npm ci --silent --no-audit --no-fund >/dev/null) || INSTALL_RC=$?
  if [ "$INSTALL_RC" -ne 0 ]; then
    echo "::warning::npm ci failed in base worktree (exit $INSTALL_RC); cannot baseline-diff."
    echo "HEAD has findings but we can't tell if they were pre-existing. Passing."
    exit 0
  fi
else
  ln -sfn "$GITHUB_WORKSPACE/node_modules" "$WORKTREE/node_modules"
fi

BASE_RC=0
run_knip "$WORKTREE" "$BASE_OUT" || BASE_RC=$?

if [ "$BASE_RC" -ne 0 ] && ! looks_like_findings "$BASE_OUT"; then
  echo "::warning::knip failed on base SHA $BASE_SHA; cannot baseline-diff."
  echo "HEAD has findings but we can't tell if they were pre-existing. Passing."
  cat "$BASE_OUT"
  exit 0
fi

normalize "$HEAD_OUT" > /tmp/knip-head.txt
normalize "$BASE_OUT" > /tmp/knip-base.txt
NEW=$(comm -13 /tmp/knip-base.txt /tmp/knip-head.txt || true)

if [ -n "$NEW" ]; then
  echo "::error::dead code introduced by this PR (not present on base $BASE_SHA):"
  echo "$NEW"
  exit 1
fi

echo "No new dead code introduced (compared against base $BASE_SHA)."
