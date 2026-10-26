#!/usr/bin/env bash
# Authenticated GitHub REST call for the current repo, without needing the gh CLI.
#
# Usage: gh-api.sh METHOD PATH [JSON_BODY_FILE]
#   PATH may contain {repo}, which expands to owner/name from the origin remote.
#   e.g. gh-api.sh GET  '/repos/{repo}/issues?state=open&per_page=100'
#        gh-api.sh POST '/repos/{repo}/issues/3/comments' body.json
#
# The token comes from git's credential helper, so it is never printed or stored.
# Prints the response body. Exits 1 with the HTTP status on stderr for 4xx/5xx.
set -euo pipefail

method=${1:?usage: gh-api.sh METHOD PATH [JSON_BODY_FILE]}
path=${2:?usage: gh-api.sh METHOD PATH [JSON_BODY_FILE]}
body=${3:-}

# the factory loop never deletes anything on GitHub
if [ "${method^^}" = "DELETE" ]; then
  echo "gh-api.sh: DELETE is not allowed by the factory loop" >&2
  exit 1
fi

remote=$(git remote get-url origin)
repo=$(printf '%s' "$remote" | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')
path=${path//\{repo\}/$repo}

token=$(printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p')
if [ -z "$token" ]; then
  echo "gh-api.sh: no GitHub credential found in git's credential helper" >&2
  exit 1
fi

args=(-s -w '\n%{http_code}' -X "$method"
  -H "Authorization: Bearer $token"
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28")
[ -n "$body" ] && args+=(--data @"$body")

out=$(curl "${args[@]}" "https://api.github.com$path")
code=${out##*$'\n'}
printf '%s\n' "${out%$'\n'*}"

if [ "$code" -ge 400 ]; then
  echo "gh-api.sh: HTTP $code for $method $path" >&2
  exit 1
fi
