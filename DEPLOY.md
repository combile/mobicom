# 랩 서버 배포 절차

`main` → 랩 서버(`203.230.103.35`, pm2 프로세스 `mobicom-app`).

이번 배포는 **8월 6일자 코드에서 177커밋을 건너뜁니다.** 스키마가 v3에서
v20으로 한 번에 올라가고, 그 안에 되돌릴 수 없는 컬럼 삭제가 있습니다.
1번을 건너뛰지 마세요.

---

## 1. DB 백업 (필수)

마이그레이션에 `ALTER TABLE mobion_users DROP COLUMN is_admin, is_professor`가
포함됩니다. 삭제 전에 두 값은 `role`로 이관되지만, 이관 로직이 이 서버의 실제
데이터에서 처음 실행되는 것이므로 되돌릴 수단을 먼저 확보합니다.

```bash
ssh mobicom@203.230.103.35
pg_dump "$DATABASE_URL" > ~/mobicom-backup-$(date +%F-%H%M).sql
ls -lh ~/mobicom-backup-*.sql
```

## 2. 현재 상태 기록

문제가 생겼을 때 돌아갈 지점입니다.

```bash
cd <앱 디렉터리>
git rev-parse --short HEAD          # 롤백 대상 커밋
pm2 describe mobicom-app | head -20
```

## 3. 코드 받기

```bash
git fetch origin
git checkout main
git pull --ff-only origin main      # 28b7e4c 이후
```

`--ff-only`인 이유: 서버에서 누군가 직접 커밋했다면 조용히 머지되는 대신
여기서 멈춰야 합니다.

## 4. 환경변수 확인

**이번 배포에 새로 추가된 키는 없습니다.** 아래 8개가 이미 있어야 합니다.

```bash
grep -oE '^[A-Z_]+' .env | sort > /tmp/have
grep -oE '^[A-Z_]+' .env.example | sort > /tmp/need
diff /tmp/have /tmp/need && echo "키 일치"
```

`MOBION_HULY_ENCRYPTION_KEY`가 바뀌면 저장된 Huly 자격증명을 복호화할 수 없어
채팅이 전부 끊깁니다. **절대 새로 만들지 마세요.**

## 5. 의존성과 빌드

```bash
npm ci
npm run build
```

`npm ci`인 이유: `package-lock.json`에 잠긴 버전 그대로 설치합니다. `install`은
락파일을 갱신할 수 있고, 특히 `@hcengineering/*`가 올라가면 6번 문제가 됩니다.

## 6. Huly 버전 일치 확인

앱은 `@hcengineering/* 0.7.423`을 씁니다. **Huly 서버의 `HULY_VERSION` 도커
태그가 이와 정확히 같아야 합니다.** 다르면 트랜잭터가 WebSocket 연결을 조용히
거부하고("Model version mismatch") 채팅만 동작하지 않습니다 — 에러가 앱까지
올라오지 않으므로 원인을 찾기 어렵습니다.

```bash
grep HULY_VERSION <huly 디렉터리>/.env
docker compose ps
```

## 7. 재시작

```bash
pm2 restart mobicom-app
pm2 logs mobicom-app --lines 50
```

## 8. 마이그레이션 확인

스키마는 첫 DB 조회 시점에 실행됩니다. **로그인 화면만 열어서는 돌지 않습니다**
— `/api/mobion/auth/me`는 쿠키가 없으면 DB를 건드리지 않습니다. 실제 조회가
일어나는 요청을 한 번 보내야 합니다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/mobion
```

그다음 결과를 확인합니다.

```bash
psql "$DATABASE_URL" -c "\d mobion_users"        # role 있음, is_admin/is_professor 없음
psql "$DATABASE_URL" -c "SELECT name, role FROM mobion_users ORDER BY created_at;"
psql "$DATABASE_URL" -c "\dt mobion_*"           # attendance, checklist, activity, channel_reads
```

**기대**: 기존 `is_admin = true` 계정이 `lead`로, `is_professor = true` 계정이
`professor`로 바뀌어 있어야 합니다. 전원이 `member`라면 이관이 실행되지 않은
것이므로 9번으로 가지 말고 로그를 먼저 확인하세요.

## 9. 동작 확인

```bash
# 채팅과 무관한 경로 (Huly가 죽어 있어도 200이어야 정상)
for p in projects schedule contests notifications home; do
  printf '%-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' \
    -b "mobion_session=<랩장 세션>" http://localhost:3000/api/mobion/$p)"
done
```

브라우저에서:

- 랩장 계정 로그인 → 레일에 **연구실 현황**(사람 아이콘)이 보이는지
- 홈 상단에 **출근 시각**이 기록됐는지
- 프로젝트 → 타임라인/목록 탭, 태스크 상세의 체크리스트·논의
- 프로필 → **화면 테마** 3단 전환

## 10. 교수님 계정 만들기

배포가 끝나야 가능합니다. 정식 경로는 초대입니다.

1. 랩장 계정으로 로그인
2. 초대 발급 → 나온 토큰을 교수님께 전달
3. 교수님이 직접 이름과 **비밀번호를 설정**해 가입
4. 랩장이 **연구실 현황 → 역할 셀렉트**에서 교수로 지정

비밀번호는 교수님만 알게 되고 어디에도 평문으로 남지 않습니다.

Huly가 떠 있지 않아도 가입은 성공합니다. 그 경우 채팅만 "연결되어 있지
않습니다"로 나오고, Huly가 살아난 뒤 첫 채팅 요청에서 자동으로 연결됩니다.

---

## 롤백

```bash
# 코드만
git checkout <2번에서 기록한 커밋>
npm ci && npm run build && pm2 restart mobicom-app

# DB까지 (컬럼 삭제를 되돌려야 할 때)
psql "$DATABASE_URL" < ~/mobicom-backup-<찍어둔 시각>.sql
```

옛 코드로 되돌리면서 DB를 그대로 두면 v20 DB에 v3 코드가 붙습니다. 옛 코드는
`is_admin`을 읽으므로 그 컬럼이 없어 실패합니다. **코드를 되돌릴 때는 DB도 함께
되돌리세요.**

---

## 알려진 제약

- **크롤러 없음.** 대회 화면은 수집 대상 사이트가 정해지지 않아 빈 목록이
  정상입니다. 저장·표시·일정 연동은 준비돼 있고 파서만 없습니다.
- **채팅은 배포 후 실측이 필요합니다.** 개발 환경에서 Huly에 접속할 수 없어
  스냅샷 범위 제한과 안 읽음 표시는 타입체크와 코드 검토까지만 된 상태입니다.
- 대회 수집 API가 세션 인증을 요구하므로, cron으로 돌리려면 크롤러 전용 토큰
  인증이 따로 필요합니다.
