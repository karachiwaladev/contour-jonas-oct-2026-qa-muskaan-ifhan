#!/usr/bin/env bash
# PreToolUse guard: blocks dangerous shell commands and reads of .env files.
# Mirrors the permissions.deny rules in .claude/settings.json, but matches anywhere in the
# command (after pipes, &&, sub-shells), which prefix-based deny rules can't.
# Pure bash so it needs no jq/python/node. Exit 2 = block; the reason goes to stderr.
payload=$(cat)

block() {
  echo "Blocked by factory guard: $1. If this is genuinely needed, ask the user to run it themselves." >&2
  exit 2
}

# tool_name decides which checks apply
tool=$(printf '%s' "$payload" | grep -oE '"tool_name" *: *"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')

case "$tool" in
  Bash|PowerShell)
    # the command as it appears in the JSON payload (still JSON-escaped, which is fine for matching)
    cmd=$(printf '%s' "$payload" | grep -oE '"command" *: *"([^"\\]|\\.)*"' | head -1)
    shopt -s nocasematch

    # rm -rf / rm -fr / rm -r -f / --recursive --force (any order), and the PowerShell equivalent
    [[ $cmd =~ (^|[^a-z])rm[[:space:]]+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|(-[a-z]+[[:space:]]+)*-r[[:space:]]+(-[a-z]+[[:space:]]+)*-f|(-[a-z]+[[:space:]]+)*-f[[:space:]]+(-[a-z]+[[:space:]]+)*-r|--recursive[[:space:]]+--force|--force[[:space:]]+--recursive) ]] \
      && block "recursive force delete (rm -rf)"
    [[ $cmd =~ remove-item[^|\;\&]*-recurse[^|\;\&]*-force|remove-item[^|\;\&]*-force[^|\;\&]*-recurse ]] \
      && block "recursive force delete (Remove-Item -Recurse -Force)"

    # git push --force / -f / --force-with-lease / +refspec
    [[ $cmd =~ git[[:space:]]+([^|\;\&]*[[:space:]])?push([[:space:]][^|\;\&]*)?[[:space:]](--force|--force-with-lease|-f)([[:space:]=]|$|\\|\") ]] \
      && block "force push"
    [[ $cmd =~ git[[:space:]]+([^|\;\&]*[[:space:]])?push[[:space:]][^|\;\&]*[[:space:]]\+[a-z0-9_./-]+ ]] \
      && block "force push (+refspec)"

    # piping a download straight into a shell: curl ... | sh, wget -O- ... | bash, iwr ... | iex
    [[ $cmd =~ (curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(sh|bash|zsh|dash|ksh|iex|invoke-expression|powershell|pwsh)([[:space:]]|$|\\|\") ]] \
      && block "piping a download into a shell (curl | sh)"

    # reading .env files: any command that names .env or .env.<suffix> as a path
    [[ $cmd =~ (^|[[:space:]\"\'=/\\:\(\<])\.env(\.[a-z0-9_-]+)?([[:space:]\"\'\;\|\&\)\>]|$|\\) ]] \
      && block "access to a .env file"
    ;;

  Read|Edit|Write|NotebookEdit|Grep|Glob)
    # file_path / path / pattern pointing at a .env file
    path=$(printf '%s' "$payload" | grep -oE '"(file_path|notebook_path|path|pattern|glob)" *: *"([^"\\]|\\.)*"')
    shopt -s nocasematch
    [[ $path =~ (^|[/\\\"])\.env(\.[a-z0-9_*-]+)?\" ]] && block "access to a .env file"
    ;;
esac

exit 0
