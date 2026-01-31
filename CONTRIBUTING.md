# Contributing to Simulacrum

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type: short description (Fixes #123)
```

### Types
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `chore` - Maintenance tasks
- `ci` - CI/CD changes
- `refactor` - Code restructuring without behavior change
- `test` - Adding or updating tests
- `style` - Formatting, whitespace (no logic changes)

### Issue References

**Always reference related issues in commits:**

```bash
# Closes issue when merged to main
git commit -m "fix: resolve stale read validation (Fixes #123)"
git commit -m "feat: add step separators (Closes #45)"

# Reference without closing
git commit -m "refactor: extract validation logic (Ref #123)"
```

GitHub automatically closes issues when commits with `Fixes #N` or `Closes #N` are merged to main.

### Examples

```
feat: add document read registry for modification tracking (Fixes #89)
fix: prevent clipping when separator is last element (Fixes #105)
docs: add OpenRouter configuration guide
chore: update dependencies
ci: add Discord announcement on release
refactor: extract embedded operations into separate module (Ref #78)
```

## Pull Requests

- Keep PRs focused on a single change
- Reference related issues in PR description
- Ensure CI passes before requesting review

## Code Style

- JavaScript: Follow existing patterns, use ES modules
- CSS: Use existing variable conventions (`--color-*`, `--spacing-*`)
- Run linter before committing if available

