# Malware blockers

These checks stop obfuscated loaders and similar supply-chain malware from entering this repository. They were added after a remote-code-execution loader was found appended to `backend/tools/autoTester/jest.config.js`, hidden off-screen behind a long run of tabs.

## Setup

Run this once in each clone:

```sh
npm run security:hooks
```

## Layers

| Layer | When it runs | Can it be bypassed? |
| --- | --- | --- |
| `.githooks/pre-commit` | Every commit, on staged content | Yes, with `--no-verify` or if hooks aren't enabled |
| `.githooks/pre-merge-commit` | Every merge commit, including `git pull`, on the merge result | Yes, the same way |
| `.githooks/pre-push` | Every push, on all files at the pushed commit | Yes, the same way |
| `.github/workflows/security-scan.yml` | Every push and pull request on GitHub | Reports only, unless it's a required status check |
| Scan step in `.github/workflows/main.yml` | Before `npm ci` and deploy | Only by editing the workflow |
| GitHub branch protection | Every push to a protected branch | Only by an admin, if admins aren't included |

Hooks only protect machines where they are enabled. They can't stop a push made with a stolen token, so branch protection is required as well.

## Required GitHub settings

Under **Settings > Branches**, add a rule for `main` and any long-lived branch:

- Block force pushes.
- Require a pull request before merging.
- Require the `scan` status check to pass.
- Apply the rule to administrators.

## What gets blocked

| Rule | Detects |
| --- | --- |
| `ioc-*` | Known markers, wallet, Ethereum endpoints and C2 paths from this incident |
| `long-line` | Lines over 2,000 characters, not counting base64 data URIs in JSON and HTML |
| `hidden-whitespace` | Code followed by 40 or more spaces or tabs and then more code |
| `obfuscated-*` | Obfuscator identifiers, escaped ASCII strings and XOR-hidden constants |
| `invisible-unicode` | Bidi controls, private-use characters and zero-width runs in code |
| `dynamic-eval`, `dynamic-function`, `hidden-process` | Running strings as code, or hidden detached processes |
| `child-process` | New use of `child_process` outside the allowlist |
| `lifecycle-script` | `preinstall`, `postinstall`, `prepare` and similar scripts in any `package.json` |
| `non-registry-dependency`, `non-registry-lockfile` | Packages installed from anywhere other than the npm registry |
| `new-install-script` | A locked package with an install script that isn't on the allowlist |
| `editor-autorun` | VS Code tasks that run when a folder is opened |
| `oversized-code` | Code files over 5 MB |

Markdown files skip the `ioc-*` rules so incident notes can name the indicators.

## If the scan blocks you

Don't run or `require` the flagged file. Open it as plain text and check the end of the flagged line, because the payload may sit far off-screen.

If the code is malicious, stop and treat it as a security incident: don't just remove it and carry on.

If it's a false positive, have a second person review it, then add the path or package to the matching allowlist at the top of `scanRepo.js`. Don't commit with `--no-verify`.
