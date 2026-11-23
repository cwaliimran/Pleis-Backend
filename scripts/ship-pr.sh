#!/bin/sh
# One command: describe the current changes, commit as the repo owner, push
# this branch, and open a pull request into main. If the pull request already
# exists, add the description as a comment instead of opening a second one.
#
# The author is always the name in this repo's git config. An agent, bot, or
# assistant name is refused and the commit is not created.
set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"

name=$(git config user.name || true)
email=$(git config user.email || true)

if [ -z "$name" ] || [ -z "$email" ]; then
  echo "Set git user.name and user.email to your name before shipping." >&2
  exit 1
fi

case $(printf '%s' "$name" | tr '[:upper:]' '[:lower:]') in
  *cursor*|*copilot*|*claude*|*chatgpt*|*openai*|*anthropic*|*gemini*|*grok*|*agent*|*assistant*|*bot*)
    echo "Refusing to commit as \"$name\". Use your own name." >&2
    exit 1
    ;;
esac

export GIT_AUTHOR_NAME="$name"
export GIT_AUTHOR_EMAIL="$email"
export GIT_COMMITTER_NAME="$name"
export GIT_COMMITTER_EMAIL="$email"

branch=$(git branch --show-current)
if [ -z "$branch" ] || [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "Run this from a feature branch, not $branch." >&2
  exit 1
fi

git add -A -- . ':(exclude).DS_Store' ':(exclude)**/.DS_Store'
git diff --cached --name-only | while IFS= read -r file; do
  case "$file" in
    .env|.env.*|*/.env|*/.env.*)
      case "$file" in
        *.example|*.sample) ;;
        *) git reset -q -- "$file" ;;
      esac
      ;;
    *.pem|credentials.json|*/credentials.json)
      git reset -q -- "$file"
      ;;
  esac
done

comment=$(mktemp)
trap 'rm -f "$comment"' EXIT

if ! git diff --cached --quiet; then
  python3 - "$comment" << 'PY'
import subprocess, sys
path = sys.argv[1]
files = subprocess.check_output(["git", "diff", "--cached", "--name-only"], text=True).splitlines()
diff = subprocess.check_output(["git", "diff", "--cached"], text=True, errors="replace")
blob = "\n".join(files) + "\n" + diff[:300000]
notes = []
if "usernoimage" in blob or 'getFullImageUrl' in blob and '"user"' in blob:
    notes.append("Users with no photo now receive usernoimage.png. Organization, event, and menu images still use noimage.png.")
if "calendarDay" in blob:
    notes.append("Staff reservation notifications send a real calendar day, so the reservations screen no longer shows Invalid Date.")
if "loyaltyclub" in blob or "getShareCodeByPublicId" in blob or "Content-Security-Policy" in blob:
    notes.append("Club share links open the loyalty club page, and the open-app page is allowed through the site script policy.")
if not notes:
    areas = []
    for f in files:
        top = f.split("/")[0]
        if top not in areas:
            areas.append(top)
    listed = ", ".join(areas[:6])
    notes.append(f"Updates {listed}.")
title = notes[0]
if len(title) > 72:
    title = title[:69].rstrip() + "..."
body = title + "\n\n" + "\n".join(f"- {note}" for note in notes) + "\n"
open(path, "w").write(body)
PY

  git commit -F "$comment"
  echo "Committed as $name <$email>"
else
  echo "Nothing new to commit."
  printf '%s\n' "Update $branch" "" "- No new file changes in this run." > "$comment"
fi

git push -u origin HEAD

if url=$(gh pr view --json url -q .url 2>/dev/null); then
  gh pr comment --body-file "$comment"
  echo "$url"
else
  title=$(head -n 1 "$comment")
  gh pr create --base main --head "$branch" --title "$title" --body-file "$comment"
fi
