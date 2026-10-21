#!/bin/sh
# Refuses a commit when staged files contain the owner's personal details. The patterns live in
# private/scan-patterns.txt (git-ignored), so this public repo never holds them.
# A scan that can't run must stop the commit, never pass it: in Phase 2 a mistyped `git grep` failed
# and a fallback printed "none found", so one commit went out unchecked (nothing had leaked).
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
patterns=private/scan-patterns.txt
if [ ! -s "$patterns" ]; then
  echo "privacy scan: $patterns is missing or empty, so nothing was checked. Commit refused." >&2
  exit 2
fi
# git grep exit status: 0 = found, 1 = nothing found, anything else = the scan itself failed.
git grep --cached -n -i -E -f "$patterns" -- . ':(exclude)private'
status=$?
case $status in
  1)
    echo "privacy scan: staged files are clear."
    exit 0
    ;;
  0)
    echo "privacy scan: personal details found above. Commit refused." >&2
    exit 1
    ;;
  *)
    echo "privacy scan: the scan itself failed (git grep exit $status). Commit refused." >&2
    exit 2
    ;;
esac
