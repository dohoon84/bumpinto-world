#!/usr/bin/env bash
# test/integration-all 갱신: 원격의 기능 브랜치들을 순서대로 다시 머지(--no-ff). 없는 브랜치는 건너뜀. 충돌 나면 거기서 멈춤.
#   bash scripts/integration-update.sh            (기본 목록)
#   bash scripts/integration-update.sh feat/econ-ui-mobile   (이 브랜치만)
# 머지만 합니다 — push·PR·develop 머지는 하지 않습니다.
set -euo pipefail
[ "$(git rev-parse --abbrev-ref HEAD)" = "test/integration-all" ] || { echo "test/integration-all 에서 실행하세요"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "커밋 안 된 변경이 있어요"; exit 1; }
git fetch origin --prune
BRANCHES=("$@"); [ ${#BRANCHES[@]} -gt 0 ] || BRANCHES=(develop feat/ui-renewal feat/econ-ui-v2 feat/economy-server feat/mobile feat/econ-ui-mobile)
for b in "${BRANCHES[@]}"; do
  if ! git rev-parse -q --verify "origin/$b" >/dev/null; then echo "· $b 없음 — 건너뜀"; continue; fi
  if git merge-base --is-ancestor "origin/$b" HEAD; then echo "· $b 이미 들어있음 ($(git rev-parse --short origin/$b))"; continue; fi
  echo "→ $b ($(git rev-parse --short origin/$b)) 머지"
  git merge --no-ff --no-edit -m "통합 테스트: $b ($(git rev-parse --short origin/$b))" "origin/$b" || {
    echo "충돌: 고친 뒤 git add … && git commit, 그리고 다시 실행하세요. 보통 src/ui-v2/econ/index.js(계정 켜짐 → createServerClient 줄 유지) · src/mobile/hud.js(메뉴 '함께' 의 account-chip 타일 유지)."; exit 1; }
done
cmp -s src/ui-v2/econ/api.js <(git show origin/feat/econ-ui-v2:src/ui-v2/econ/api.js) && echo "api.js = feat/econ-ui-v2 과 같음" || echo "주의: api.js 가 feat/econ-ui-v2 와 다름"
echo "끝. npm install(의존성 바뀌었으면) 후 npm run dev:all"
