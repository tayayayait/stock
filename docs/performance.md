# 성능 점검 메모

## 동시 주문 출고 시 음수 차감 방지 검증
- `npm run test` 시 동작하는 단위 테스트는 `src/services/http` 계층이 동일한 idempotency 키를 사용할 때 재고 차감을 한 번만 수행하는지 확인합니다. 테스트는 응답을 캐싱하고 두 번째 호출이 재고를 다시 차감하지 않는지 확인해 음수 재고 발생을 예방합니다. 【F:tests/unit/services.http.concurrency.test.ts†L1-L78】
- `tests/integration/concurrency.sales.test.ts`는 `shipSO` API 래퍼가 동일한 idempotency 키로 동시에 호출될 때 서버가 한 번만 재고를 차감하고 동일한 응답을 재사용하는지 시뮬레이션합니다. 재고가 한 번만 감소했는지와 응답이 동일한지 검증해 실서비스에서의 레이스 컨디션을 대비합니다. 【F:tests/integration/concurrency.sales.test.ts†L1-L82】
- Playwright E2E 시나리오는 사용자가 `출고처리` 버튼을 연속으로 누르는 상황을 재현해 첫 번째 요청 성공 후 두 번째 요청이 400 에러로 안전하게 차단되는지 확인합니다. 테스트는 가용 재고가 음수로 내려가지 않았는지도 검증합니다. 【F:tests/e2e/sales-flow.spec.ts†L175-L265】

## 키셋 페이지네이션 및 인덱스 튜닝 확인 사항
- 판매 주문 목록 API는 주문일 내림차순으로 정렬된 리스트를 반환합니다. 대량 데이터에서 성능을 유지하려면 `orderDate DESC, id DESC` 복합 인덱스(또는 Prisma `@@index`)를 추가하고 keyset(커서) 페이지네이션을 도입하는 것이 좋습니다. 현재 구현은 `findMany` 호출에 제한이 없어 추후 커서 기반 페이징을 도입할 때 `orderDate`와 `id`를 기준으로 커서를 구성해야 합니다. 【F:server/src/routes/salesOrders.ts†L320-L368】
- 추천 튜닝 절차:
  1. 운영 DB에서 `EXPLAIN ANALYZE`를 사용해 `/api/sales-orders` 쿼리가 인덱스를 활용하는지 확인합니다.
  2. 필요 시 다음과 같은 인덱스를 추가합니다.
     ```sql
     CREATE INDEX CONCURRENTLY IF NOT EXISTS sales_orders_order_date_id_idx
       ON "SalesOrder" ("orderDate" DESC, "id" DESC);
     ```
  3. Prisma를 사용한다면 `schema.prisma`에 동일한 `@@index` 선언을 추가해 마이그레이션으로 관리합니다.
  4. 응답 크기를 줄이기 위해 커서 기반 페이지네이션을 도입하고, `orderDate`와 `id`를 커서 필드로 사용합니다.

## 모니터링 및 점검 루틴
- 배포 전 `npm run lint`, `npm run test`, `npm run test:e2e`를 실행해 위 테스트들이 지속적으로 음수 재고 차단 로직을 검증하도록 유지합니다.
- New Relic, Datadog 등의 APM에 `/api/sales-orders/:id/ship` 엔드포인트 대기 시간 및 에러율을 대시보드화해 레이스 컨디션 발생 여부를 모니터링합니다.
- DB 레벨에서는 `stockLevel` 테이블의 잔여량이 음수인 레코드가 없는지 주기적으로 점검하고, 발견 시 테스트 로그와 비교해 원인을 역추적합니다.
