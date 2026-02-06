#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="upstream"
BASE_BRANCH="main"
CHANGELOG="fork_changelog.md"
PROTECTED_PATHS="db/,database/,data/,prisma/,supabase/,*.db,*.sqlite"
ALLOW_DIRTY="false"
REPORT_FILE="fork_sync_report.md"
TEST_COMMAND="auto"
SKIP_TESTS="false"
ORIGIN_REMOTE="origin"
PUSH_ORIGIN="true"

MERGE_STATUS="not-started"
CONFLICT_COUNT="0"
PROTECTED_REAPPLIED_COUNT="0"
UPSTREAM_AHEAD="0"
UPSTREAM_NEW_COMMITS=""
UPSTREAM_HEAD_SHA="unknown"
PREVIOUS_SYNC_SHA="not-found"
PREVIOUS_SYNC_SHA_VALID="false"
TEST_STATUS="not-run"
TEST_EXIT_CODE="n/a"
TEST_LOG_FILE=""
PUSH_STATUS="not-run"
PUSH_EXIT_CODE="n/a"
PUSH_LOG_FILE=""
ORIGIN_SYNC_BEFORE="unknown"
ORIGIN_SYNC_AFTER="unknown"

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --upstream <name>          Upstream remote name (default: upstream)
  --base-branch <name>       Upstream base branch (default: main)
  --changelog <path>         Private changelog file (default: fork_changelog.md)
  --report <path>            Final execution report file (default: fork_sync_report.md)
  --test-command <cmd>       Test command to validate app (default: auto)
  --skip-tests               Skip app tests at the end
  --origin <name>            Origin remote name for publish (default: origin)
  --no-push-origin           Do not publish local branch to origin at the end
  --protected-paths <csv>    CSV patterns to preserve local state
  --allow-dirty              Allow running with dirty working tree
  -h, --help                 Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --upstream)
      UPSTREAM="$2"
      shift 2
      ;;
    --base-branch)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --changelog)
      CHANGELOG="$2"
      shift 2
      ;;
    --report)
      REPORT_FILE="$2"
      shift 2
      ;;
    --test-command)
      TEST_COMMAND="$2"
      shift 2
      ;;
    --skip-tests)
      SKIP_TESTS="true"
      shift
      ;;
    --origin)
      ORIGIN_REMOTE="$2"
      shift 2
      ;;
    --no-push-origin)
      PUSH_ORIGIN="false"
      shift
      ;;
    --protected-paths)
      PROTECTED_PATHS="$2"
      shift 2
      ;;
    --allow-dirty)
      ALLOW_DIRTY="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

if ! git remote get-url "$UPSTREAM" >/dev/null 2>&1; then
  echo "Error: upstream remote '$UPSTREAM' not found." >&2
  exit 1
fi

if [[ "$ALLOW_DIRTY" != "true" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is dirty. Commit/stash changes or use --allow-dirty." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse --short HEAD)"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
REPO_ROOT="$(git rev-parse --show-toplevel)"

resolve_test_command() {
  if [[ "$TEST_COMMAND" != "auto" ]]; then
    echo "$TEST_COMMAND"
    return 0
  fi

  if [[ -f "$REPO_ROOT/package.json" ]]; then
    if command -v bun >/dev/null 2>&1 && [[ -f "$REPO_ROOT/bun.lock" || -f "$REPO_ROOT/bun.lockb" ]]; then
      echo "bun run test"
      return 0
    fi
    if command -v npm >/dev/null 2>&1; then
      echo "npm test"
      return 0
    fi
  fi

  echo ""
}

run_app_tests() {
  local cmd
  if [[ "$SKIP_TESTS" == "true" ]]; then
    TEST_STATUS="skipped"
    TEST_EXIT_CODE="0"
    return 0
  fi

  cmd="$(resolve_test_command)"
  if [[ -z "$cmd" ]]; then
    TEST_STATUS="skipped-no-command"
    TEST_EXIT_CODE="0"
    return 0
  fi

  TEST_LOG_FILE="${REPORT_FILE%.md}.tests.log"
  echo "Running app tests: $cmd"

  set +e
  (
    cd "$REPO_ROOT"
    /bin/bash -lc "$cmd"
  ) >"$TEST_LOG_FILE" 2>&1
  TEST_EXIT_CODE="$?"
  set -e

  if [[ "$TEST_EXIT_CODE" == "0" ]]; then
    TEST_STATUS="passed"
  else
    TEST_STATUS="failed"
  fi
}

extract_last_synced_upstream_sha() {
  local sha_line
  if [[ ! -f "$CHANGELOG" ]]; then
    echo "not-found"
    return 0
  fi

  sha_line="$(grep -E "^- Last synced upstream commit:" "$CHANGELOG" | tail -n 1 | sed -E 's/^- Last synced upstream commit:[[:space:]]*//')"
  if [[ -z "$sha_line" ]]; then
    echo "not-found"
    return 0
  fi
  echo "$sha_line"
}

append_sync_marker() {
  {
    echo "- Sync result: $MERGE_STATUS"
    echo "- Last synced upstream commit: $UPSTREAM_HEAD_SHA"
    echo
  } >> "$CHANGELOG"
}

capture_origin_sync() {
  local counts
  local local_ahead
  local remote_ahead
  counts="$(git rev-list --left-right --count "$CURRENT_BRANCH...$ORIGIN_REMOTE/$CURRENT_BRANCH" 2>/dev/null || true)"
  if [[ -n "$counts" ]]; then
    read -r local_ahead remote_ahead <<< "$counts"
    ORIGIN_SYNC_BEFORE="local-ahead:${local_ahead:-0} remote-ahead:${remote_ahead:-0}"
  fi
}

sync_origin_branch() {
  local rc
  PUSH_EXIT_CODE="0"
  PUSH_STATUS="not-run"

  if [[ "$PUSH_ORIGIN" != "true" ]]; then
    PUSH_STATUS="skipped-disabled"
    return 0
  fi

  if [[ "$TEST_STATUS" == "failed" ]]; then
    PUSH_STATUS="skipped-tests-failed"
    return 0
  fi

  if ! git remote get-url "$ORIGIN_REMOTE" >/dev/null 2>&1; then
    PUSH_STATUS="skipped-no-origin-remote"
    return 0
  fi

  git fetch "$ORIGIN_REMOTE" "$CURRENT_BRANCH" >/dev/null 2>&1 || true
  capture_origin_sync

  if [[ "$ORIGIN_SYNC_BEFORE" == "local-ahead:0 remote-ahead:0" ]]; then
    PUSH_STATUS="up-to-date"
    ORIGIN_SYNC_AFTER="$ORIGIN_SYNC_BEFORE"
    return 0
  fi

  PUSH_LOG_FILE="${REPORT_FILE%.md}.push.log"
  echo "Publishing local branch to $ORIGIN_REMOTE/$CURRENT_BRANCH..."

  set +e
  git push "$ORIGIN_REMOTE" "HEAD:$CURRENT_BRANCH" >"$PUSH_LOG_FILE" 2>&1
  rc="$?"
  set -e

  PUSH_EXIT_CODE="$rc"
  if [[ "$rc" != "0" ]]; then
    PUSH_STATUS="failed"
    ORIGIN_SYNC_AFTER="unknown"
    return 0
  fi

  PUSH_STATUS="pushed"
  git fetch "$ORIGIN_REMOTE" "$CURRENT_BRANCH" >/dev/null 2>&1 || true
  {
    local counts_after
    local local_ahead_after
    local remote_ahead_after
    counts_after="$(git rev-list --left-right --count "$CURRENT_BRANCH...$ORIGIN_REMOTE/$CURRENT_BRANCH" 2>/dev/null || true)"
    if [[ -n "$counts_after" ]]; then
      read -r local_ahead_after remote_ahead_after <<< "$counts_after"
      ORIGIN_SYNC_AFTER="local-ahead:${local_ahead_after:-0} remote-ahead:${remote_ahead_after:-0}"
    fi
  }
}

finalize_run() {
  local final_exit
  final_exit=0

  run_app_tests
  sync_origin_branch
  append_sync_marker
  write_report
  echo "Report written to: $REPORT_FILE"

  if [[ "$TEST_STATUS" == "failed" ]]; then
    echo "Warning: app tests failed. Check log: $TEST_LOG_FILE" >&2
    final_exit=2
  fi

  if [[ "$PUSH_STATUS" == "failed" ]]; then
    echo "Warning: failed to push to $ORIGIN_REMOTE/$CURRENT_BRANCH. Check log: $PUSH_LOG_FILE" >&2
    if [[ "$final_exit" == "0" ]]; then
      final_exit=3
    fi
  fi

  return "$final_exit"
}

write_report() {
  local expected_result
  local final_head
  local final_worktree

  final_head="$(git rev-parse --short HEAD)"
  final_worktree="clean"
  if [[ -n "$(git status --porcelain)" ]]; then
    final_worktree="dirty"
  fi

  case "$MERGE_STATUS" in
    no-upstream-updates)
      expected_result="Repositorio ja estava atualizado com upstream; apenas rastreabilidade no changelog e relatorio."
      ;;
    merged)
      expected_result="Atualizacoes do upstream integradas com prioridade local; customizacoes privadas e caminhos protegidos preservados."
      ;;
    merged-no-tree-change)
      expected_result="Historico do upstream integrado via merge commit sem alterar arvore de arquivos local; customizacoes preservadas."
      ;;
    merge-aborted-no-diff)
      expected_result="Nenhuma mudanca efetiva apos estrategia de preservacao local; merge cancelado para evitar commit vazio."
      ;;
    *)
      expected_result="Execucao parcial; revisar logs para detalhes."
      ;;
  esac

  {
    echo "# Fork Sync Report"
    echo
    echo "## Execution"
    echo "- Timestamp (UTC): $TIMESTAMP"
    echo "- Repository: $REPO_ROOT"
    echo "- Branch: $CURRENT_BRANCH"
    echo "- Head before: $HEAD_SHA"
    echo "- Head after: $final_head"
    echo "- Upstream base: $UPSTREAM/$BASE_BRANCH"
    echo "- Upstream head synced: $UPSTREAM_HEAD_SHA"
    echo "- Previous synced upstream commit (from changelog): $PREVIOUS_SYNC_SHA"
    echo "- Merge status: $MERGE_STATUS"
    echo "- Working tree: $final_worktree"
    echo
    echo "## Current Situation"
    echo "- Private commits vs upstream: $PRIVATE_COUNT"
    echo "- Upstream commits detected: $UPSTREAM_AHEAD"
    echo "- Conflicts auto-resolved with local priority: $CONFLICT_COUNT"
    echo "- Protected path files reapplied from local HEAD: $PROTECTED_REAPPLIED_COUNT"
    echo
    echo "## New From Upstream"
    if [[ -n "$UPSTREAM_NEW_COMMITS" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && echo "- $line"
      done <<< "$UPSTREAM_NEW_COMMITS"
    else
      echo "- No new upstream commits detected in this run."
    fi
    echo
    echo "## Expected Result"
    echo "- $expected_result"
    echo
    echo "## App Test Validation"
    echo "- Test status: $TEST_STATUS"
    echo "- Test exit code: $TEST_EXIT_CODE"
    if [[ -n "$TEST_LOG_FILE" ]]; then
      echo "- Test log file: $TEST_LOG_FILE"
      if [[ -f "$TEST_LOG_FILE" ]]; then
        echo
        echo "### Test Log Tail"
        tail -n 40 "$TEST_LOG_FILE" | sed 's/^/    /'
      fi
    fi
    echo
    echo "## Origin Publish"
    echo "- Origin remote: $ORIGIN_REMOTE"
    echo "- Push enabled: $PUSH_ORIGIN"
    echo "- Push status: $PUSH_STATUS"
    echo "- Push exit code: $PUSH_EXIT_CODE"
    echo "- Sync before push: $ORIGIN_SYNC_BEFORE"
    echo "- Sync after push: $ORIGIN_SYNC_AFTER"
    if [[ -n "$PUSH_LOG_FILE" ]]; then
      echo "- Push log file: $PUSH_LOG_FILE"
      if [[ -f "$PUSH_LOG_FILE" ]]; then
        echo
        echo "### Push Log Tail"
        tail -n 40 "$PUSH_LOG_FILE" | sed 's/^/    /'
      fi
    fi
    echo
  } > "$REPORT_FILE"
}

echo "[1/5] Fetching $UPSTREAM..."
git fetch "$UPSTREAM"

PRIVATE_COMMITS="$(git log --oneline "$UPSTREAM/$BASE_BRANCH"..HEAD || true)"
PRIVATE_COUNT="$(git rev-list --count "$UPSTREAM/$BASE_BRANCH"..HEAD || echo "0")"
UPSTREAM_HEAD_SHA="$(git rev-parse --short "$UPSTREAM/$BASE_BRANCH")"
PREVIOUS_SYNC_SHA="$(extract_last_synced_upstream_sha)"
if git rev-parse -q --verify "${PREVIOUS_SYNC_SHA}^{commit}" >/dev/null 2>&1; then
  PREVIOUS_SYNC_SHA_VALID="true"
fi

if [[ ! -f "$CHANGELOG" ]]; then
  {
    echo "# Private Change Log"
    echo
    echo "Tracks local/private fork changes against upstream."
    echo
  } > "$CHANGELOG"
fi

{
  echo "## $TIMESTAMP"
  echo
  echo "- Branch: $CURRENT_BRANCH"
  echo "- HEAD: $HEAD_SHA"
  echo "- Upstream base: $UPSTREAM/$BASE_BRANCH"
  echo "- Previous synced upstream commit (from changelog): $PREVIOUS_SYNC_SHA"
  echo "- Target upstream commit for this run: $UPSTREAM_HEAD_SHA"
  echo "- Private commits: $PRIVATE_COUNT"
  if [[ -n "$PRIVATE_COMMITS" ]]; then
    echo "- Commit list:"
    while IFS= read -r line; do
      [[ -n "$line" ]] && echo "  - $line"
    done <<< "$PRIVATE_COMMITS"
  fi
  echo
} >> "$CHANGELOG"

echo "[2/5] Checking upstream changes..."
UPSTREAM_AHEAD="$(git rev-list --count HEAD.."$UPSTREAM/$BASE_BRANCH" || echo "0")"
if [[ "$PREVIOUS_SYNC_SHA_VALID" == "true" ]]; then
  UPSTREAM_NEW_COMMITS="$(git log --oneline "$PREVIOUS_SYNC_SHA".."$UPSTREAM/$BASE_BRANCH" || true)"
else
  UPSTREAM_NEW_COMMITS="$(git log --oneline HEAD.."$UPSTREAM/$BASE_BRANCH" || true)"
fi

if [[ "$UPSTREAM_AHEAD" -eq 0 ]]; then
  echo "No upstream updates to merge."
  MERGE_STATUS="no-upstream-updates"
  FINAL_EXIT="0"
  if ! finalize_run; then
    FINAL_EXIT="$?"
  fi
  echo "Done."
  exit "$FINAL_EXIT"
fi

echo "[3/5] Merging upstream with local-priority conflict strategy..."
if ! git merge --no-ff --no-commit -X ours "$UPSTREAM/$BASE_BRANCH"; then
  echo "Merge reported conflicts. Resolving all conflicts with local (ours) version..."
  CONFLICTED_FILES="$(git diff --name-only --diff-filter=U || true)"
  if [[ -z "$CONFLICTED_FILES" ]]; then
    echo "Error: merge failed but no conflicted files were found." >&2
    git merge --abort || true
    exit 1
  fi

  CONFLICT_COUNT="$(printf '%s\n' "$CONFLICTED_FILES" | sed '/^$/d' | wc -l | tr -d ' ')"

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    git checkout --ours -- "$file"
    git add "$file"
  done <<< "$CONFLICTED_FILES"
fi

echo "[4/5] Reapplying local priority for protected paths..."
IFS=',' read -r -a patterns <<< "$PROTECTED_PATHS"
for pattern in "${patterns[@]}"; do
  declare -a files=()
  [[ -z "$pattern" ]] && continue
  while IFS= read -r f; do
    if [[ "$f" == $pattern || "$f" == */$pattern ]]; then
      files+=("$f")
    fi
  done < <(git diff --name-only --cached)

  if [[ "${#files[@]}" -eq 0 ]]; then
    continue
  fi

  for f in "${files[@]}"; do
    [[ -z "$f" ]] && continue
    git checkout HEAD -- "$f" || true
    git add "$f" || true
    PROTECTED_REAPPLIED_COUNT="$((PROTECTED_REAPPLIED_COUNT + 1))"
  done
done

echo "[5/5] Creating merge commit..."
if git diff --cached --quiet; then
  if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
    echo "No tree changes after resolution; creating merge commit to record upstream sync."
    if ! git commit -m "chore(sync): merge $UPSTREAM/$BASE_BRANCH preserving local customizations (no tree changes)"; then
      git commit --allow-empty -m "chore(sync): merge $UPSTREAM/$BASE_BRANCH preserving local customizations (no tree changes)"
    fi
    MERGE_STATUS="merged-no-tree-change"
  else
    echo "Nothing to commit and no merge in progress; finalizing."
    MERGE_STATUS="merge-aborted-no-diff"
  fi
else
  git commit -m "chore(sync): merge $UPSTREAM/$BASE_BRANCH preserving local customizations"
  MERGE_STATUS="merged"
fi
FINAL_EXIT="0"
if ! finalize_run; then
  FINAL_EXIT="$?"
fi

echo "Done: upstream merged safely with local-priority rules."
exit "$FINAL_EXIT"
