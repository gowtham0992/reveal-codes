#!/usr/bin/env bash
# PostTaskExec hook: commit the working tree after a Kiro spec task completes.
# Reads the hook payload (JSON) on STDIN and uses the task title as the message.
# Never pushes, never amends. Exits 0 when there is nothing to commit.
set -u
export LC_ALL=en_US.UTF-8

# Scope from NUL-separated paths on stdin. Paths under .kiro/ and docs/ are
# ignored. One packages/<name> or apps/<name> shared by every other path gives
# <name>; anything else, or only ignored paths, gives "repo". No paths at all
# prints nothing.
scope_of() {
  local key="" k rest path any=0
  while IFS= read -r -d '' path; do
    any=1
    case "$path" in .kiro/*|docs/*) continue ;; esac
    case "$path" in
      packages/*/*) rest="${path#packages/}"; k="packages/${rest%%/*}" ;;
      apps/*/*)     rest="${path#apps/}";     k="apps/${rest%%/*}" ;;
      *) key="repo"; break ;;
    esac
    if [ -z "$key" ]; then key="$k"
    elif [ "$key" != "$k" ]; then key="repo"; break; fi
  done
  if [ "$any" = 1 ] && [ -z "$key" ]; then key="repo"; fi
  case "$key" in "" | repo) printf '%s' "$key" ;; *) printf '%s' "${key#*/}" ;; esac
}

if [ "${1:-}" = "--print-scope" ]; then
  tr '\n' '\0' | scope_of
  exit 0
fi

cd "$(dirname "$0")/.." || exit 0

payload="$(cat)"

# The PostTaskExec payload schema is not documented field by field, so try the
# likely locations of the task title in order and take the first non-empty one.
title=""
if [ -n "$payload" ]; then
  title="$(printf '%s' "$payload" | jq -r '
    try (
      [ .task.title?, .task.name?, .task.description?, .taskTitle?, .task_title?,
        .taskName?, .task_name?, .title?, (.task | strings) ]
      | map(select(type == "string" and length > 0)) | first // empty
    ) catch empty' 2>/dev/null)"
fi

# One line, single spaces.
title="$(printf '%s' "$title" | tr '\r\n\t' '   ' | sed -E 's/ +/ /g; s/^ //; s/ $//')"
if [ -z "$title" ]; then
  echo "commit-task: no task title found in hook payload; using 'spec task'" >&2
  title="spec task"
fi

if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

git add -A || exit $?

scope="$(git diff --cached --name-only -z | scope_of)"
if [ -z "$scope" ]; then
  exit 0
fi

prefix="feat(${scope}): "
max=72
subject="${prefix}${title}"
body=""
if [ "${#subject}" -gt "$max" ]; then
  keep=$((max - ${#prefix} - 3))
  short="$(printf '%s' "${title:0:keep}" | sed -E 's/ +$//')"
  subject="${prefix}${short}..."
  body="$title"
fi

if [ -n "$body" ]; then
  git commit -q -m "$subject" -m "$body"
else
  git commit -q -m "$subject"
fi
