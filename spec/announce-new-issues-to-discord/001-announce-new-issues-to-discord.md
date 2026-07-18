# Announce New Issues to Discord

Announce each newly opened GitHub issue through the repository's Discord webhook without
committing or exposing the webhook credential.

## Acceptance Criteria

- [x] A GitHub Actions workflow runs for the `issues` event only when an issue is opened.
- [x] The Discord announcement includes the issue title, a concise description summary, and a
      link to the issue.
- [x] Empty, multiline, and long descriptions produce a valid bounded Discord payload, and the
      announcement cannot trigger Discord mentions.
- [x] The workflow uses least-privilege permissions and reads the webhook URL from the
      `DISCORD_ISSUE_WEBHOOK_URL` Actions secret.

## Verification

- [x] Prettier accepts the workflow and specification files.
- [x] A representative issue event produces a payload with the expected title, summary, and URL.
- [x] Empty and long issue descriptions produce the fallback and truncated summaries without
      exceeding the configured summary limit.
- [x] The `DISCORD_ISSUE_WEBHOOK_URL` repository secret is configured, and only its name is
      observable through repository metadata.
- [x] The configured Discord webhook endpoint accepts authenticated requests without posting a
      test announcement.
