# Project collaboration rules

The developer implements, tests, fixes and delivers. The product manager owns requirements, delivery review and acceptance. User instructions take priority. The user permits this source repository to be public; this does not authorize uploading personal data.

## Work location and data

- Continue development and automated tests in a cloud workspace or GitHub-hosted runner. Do not resume bulk dependency installation, browser downloads or full test suites on the user's computer.
- Resolve the repository root from the actual checkout or script location. Cloud tasks must not access Windows local paths. Write only inside the controlled task workspace; local Windows work remains restricted to the user's designated project directory.
- Never commit real resumes, application trackers, private profiles, credentials, cookies, browser sessions, runtime databases, `.runtime/`, dependencies, downloads, logs, screenshots or recordings. Use explicitly fictional fixtures in cloud tests.
- Use GitHub-hosted runners only, with bounded concurrency and timeouts. Never register the user's computer as a self-hosted runner.

## Collaboration

- Read `GITHUB_MIGRATION_STATUS.md` for the verified collaboration Issue. At the start, at important stage changes and before ending, read its latest comments and referenced tasks. Until an Issue exists, do not invent one or claim remote handoff is complete.
- Use PM-xxxx and DEV-xxxx identifiers. Append only your own real conclusions; do not rewrite the other party's history or impersonate them.
- Deliver code through branches and PRs. Include commit SHA, actual test results, links, failures and unverified items. Developers mark delivery as pending acceptance; only the product manager records acceptance.
- Issue comments do not automatically wake another conversation unless a trigger has actually been configured and verified. Do not claim another party read or accepted a message without evidence.
- Source upload, remote development execution, automated CI and real application execution are separate milestones. Report each honestly.

## Implementation priorities

Read `SPEC.md`, `DEVELOPMENT_SNAPSHOT.md`, `local-app/CONTRACT.md` and the current collaboration Issue. Preserve profile validation, original-value protection and structure checks. Never fabricate application answers or completion logs. Persist the submission boundary before clicking submit; an unknown result must never be automatically resubmitted.
