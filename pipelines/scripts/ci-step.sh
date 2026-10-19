#!/usr/bin/env bash
# ci-step.sh TITLE COMMAND...
# Runs a CI command. If it fails, the end of its output is added to the run as one annotation, so the failure can be
# read on the pull request (and through the API) without opening the logs.
set -o pipefail
title=$1
shift
log=$(mktemp)
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  message=$(tail -n "${CI_STEP_LINES:-150}" "$log" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | python3 -c 'import sys; d=sys.stdin.read()[-60000:]; print(d.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A"), end="")')
  echo "::error title=${title} failed::${message}"
fi
exit "$status"
