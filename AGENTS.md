# Project collaboration rules

Start with [HANDOFF.md](HANDOFF.md), the unified entry point on the effective development branch. There are only two roles: Engineer implements, tests, fixes and delivers; Manager owns requirements, tasks, delivery review and acceptance. Accounts may alternate roles; normally one Manager + Engineer pair owns the current work. User instructions take priority. The user permits this source repository to be public; this does not authorize uploading personal data.

## Work location and data

- Continue development and automated tests in a cloud workspace or GitHub-hosted runner. Do not resume bulk dependency installation, browser downloads or full test suites on the user's computer.
- Resolve the repository root from the actual checkout or script location. Cloud tasks must not access Windows local paths. Write only inside the controlled task workspace; local Windows work remains restricted to the user's designated project directory.
- Never commit real resumes, application trackers, private profiles, credentials, cookies, browser sessions, runtime databases, `.runtime/`, dependencies, downloads, logs, screenshots or recordings. Use explicitly fictional fixtures in cloud tests.
- Use GitHub-hosted runners only, with bounded concurrency and timeouts. Never register the user's computer as a self-hosted runner.

## Collaboration

- Read `HANDOFF.md` first, then the latest relevant Issue/PR and referenced requirements as needed. GitHub is the shared source; do not scan the user's local project or reread all history each turn. PR #5 inherits unmerged PR #4; use the effective branch named in HANDOFF, not old main.
- Confirm the current owner and execution status before taking over. Engineers need an explicit task, branch, acceptance criteria and execution authority. If the previous writer may still be active, resolve ownership before branch writes; do not overwrite their work.
- Preserve original task requirements in the existing Issue/PR. At meaningful progress or handoff, push code and record completed work, branch/SHA, actual validation, remaining work/blockers and next action. Resume from the last verified pushed checkpoint; unpushed work may be unrecoverable.
- Update shared state only for substantive progress, decisions or handoff, not every chat reply. Role + linked task/comment identifies work; historical PM/DEV identifiers remain valid but no global counter or A/B roles are required.
- Deliver through branches/PRs with actual evidence and unverified items. Engineer delivery is pending acceptance; Manager records acceptance. Do not merge PR #4/#5 without explicit authorization.
- Issue comments do not automatically wake another conversation. Do not claim another party read, accepted or stopped work without evidence; accounts do not share chat memory, credentials or workspaces.
- Follow HANDOFF's user-teaching and personal acceptance rules: provide a usable installation/start/access route before inviting use; first real application requires the user's confirmation of the job, profile, attachment and submission action. Prefer direct user observation over default recordings/demo packages.
- The user's latest instructions and HANDOFF's current coordination rules supersede conflicting legacy handoff/role/display instructions. Source upload, cloud development, automated CI and real application execution remain separate milestones.

## Implementation priorities

Prioritize the first real-site end-to-end application flow. Read the task's necessary references via HANDOFF, including `SPEC.md` and `local-app/CONTRACT.md`. Reuse valid unaffected evidence; run necessary checks for actual changes, defer nonblocking bugs/polish, and do not expand acceptance criteria without an explicit scope change. Preserve profile validation, original-value protection and structure checks. Never fabricate application answers or completion logs. Persist the submission boundary before clicking submit; an unknown result must never be automatically resubmitted.
