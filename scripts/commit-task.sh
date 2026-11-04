#!/usr/bin/env bash
# PostTaskExec hook: commit the working tree after a Kiro spec task completes.
# Reads the hook payload (JSON) on STDIN and uses the task title as the message.
# Never pushes, never amends. Exits 0 when there is nothing to commit.
set -u
export LC_ALL=en_US.UTF-8

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

prefix="feat(engine): "
max=72
subject="${prefix}${title}"
body=""
if [ "${#subject}" -gt "$max" ]; then
  keep=$((max - ${#prefix} - 3))
  short="$(printf '%s' "${title:0:keep}" | sed -E 's/ +$//')"
  subject="${prefix}${short}..."
  body="$title"
fi

git add -A || exit $?
if [ -n "$body" ]; then
  git commit -q -m "$subject" -m "$body"
else
  git commit -q -m "$subject"
fi
