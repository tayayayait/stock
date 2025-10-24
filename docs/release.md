# 배포 및 롤백 가이드

## 1. 사전 점검 체크리스트
1. 의존성 설치가 최신 상태인지 확인합니다.
   ```bash
   npm install
   (cd server && npm install)
   ```
2. 타입 검사와 린트를 통과해야 합니다.
   ```bash
   npm run lint
   ```
3. 단위/통합 테스트, E2E 테스트를 실행해 동시 출고 방어 로직을 확인합니다.
   ```bash
   npm run test
   npm run test:e2e
   ```
4. 서버가 필요할 경우 `server` 폴더에서 `npm run test` 혹은 Prisma 마이그레이션 검증을 수행합니다.

## 2. 배포 절차
### 2.1 웹 대시보드 (Vite)
1. 환경 변수 파일을 환경에 맞게 준비합니다. `VITE_API_URL`, `VITE_FEATURE_LOCAL_MODE`, `VITE_USE_SERVER`, `VITE_SLACK_WEBHOOK_URL`, `VITE_WEBHOOK_URL` 값을 배포 대상 환경에 맞춰 설정합니다. 【F:README.md†L20-L57】
2. 프로덕션 번들을 생성합니다.
   ```bash
   npm run build
   ```
3. 산출된 `dist/`를 대상 호스팅(GitHub Pages, CDN 등)에 업로드합니다.
4. 배포 후 Smoke Test: `/sales` 화면에서 판매 주문을 조회하고, `출고처리` 버튼이 idempotency 헤더를 포함해 요청을 보내는지 Network 탭으로 확인합니다. 【F:tests/e2e/sales-flow.spec.ts†L175-L265】

### 2.2 Fastify API 서버
1. 서버 환경 변수(`SLACK_WEBHOOK_URL` 등)를 `.env` 또는 비밀 관리자에 반영합니다. 【F:README.md†L20-L57】
2. 데이터베이스 마이그레이션과 시드가 필요한 경우 순서대로 실행합니다.
   ```bash
   cd server
   npx prisma migrate deploy
   npm run prisma:seed
   ```
3. 애플리케이션을 재시작합니다. (예: `pm2 restart stockwise-api`)
4. 헬스 체크: `curl https://<호스트>/health` 가 `{"status":"ok"}`를 반환하는지 확인합니다. 【F:README.md†L58-L83】

## 3. 롤백 전략
1. 문제가 발견되면 즉시 모니터링 알람을 확인하고 실패한 배포 버전을 기록합니다.
2. 프론트엔드: 이전에 안정적인 `dist` 아티팩트를 다시 배포하거나 GitHub Pages의 이전 워크플로 아티팩트를 재배포합니다.
3. 서버: 직전 Git 태그 또는 커밋으로 체크아웃 후 `npx prisma migrate resolve --rolled-back <migration>`로 마이그레이션 상태를 조정하고 재배포합니다.
4. 롤백 후에는 반드시 `npm run test`와 `npm run test:e2e`를 재실행해 동시 출고 테스트가 통과하는지 재확인합니다.

## 4. 운영 중 모니터링 포인트
- `/api/sales-orders/:id/ship` 엔드포인트의 400/409 비율을 추적해 동시 출고 오류가 반복되는지 확인합니다.
- DB에서 `stockLevel` 테이블에 음수 잔여량이 존재하는지 주기적으로 쿼리합니다.
- 배포마다 `docs/performance.md`의 체크리스트를 검토해 인덱스와 페이지네이션 전략이 최신 상태인지 확인합니다. 【F:docs/performance.md†L1-L33】
