export type ReportMock = {
  id: string;
  title: string;
  period: { start: string; end: string };
  generatedAt: string;
  owner: string;
  status: 'draft' | 'published' | 'archived';
};

export const reports: ReportMock[] = [
  {
    id: 'rep-001',
    title: '1월 판매 요약 보고서',
    period: { start: '2025-01-01', end: '2025-01-07' },
    generatedAt: '2025-01-08T09:00:00+09:00',
    owner: '영업기획팀',
    status: 'published',
  },
  {
    id: 'rep-002',
    title: '재고 변동 분석',
    period: { start: '2025-01-01', end: '2025-01-07' },
    generatedAt: '2025-01-08T10:15:00+09:00',
    owner: '물류관리팀',
    status: 'published',
  },
  {
    id: 'rep-003',
    title: '주요 거래처 매출 추이',
    period: { start: '2024-12-15', end: '2025-01-07' },
    generatedAt: '2025-01-08T11:30:00+09:00',
    owner: '데이터전략팀',
    status: 'draft',
  },
  {
    id: 'rep-004',
    title: '배송 지연 사례 분석',
    period: { start: '2024-12-20', end: '2025-01-06' },
    generatedAt: '2025-01-08T12:45:00+09:00',
    owner: '고객지원팀',
    status: 'published',
  },
  {
    id: 'rep-005',
    title: '프로모션 효과 측정',
    period: { start: '2025-01-01', end: '2025-01-05' },
    generatedAt: '2025-01-08T14:00:00+09:00',
    owner: '마케팅팀',
    status: 'draft',
  },
  {
    id: 'rep-006',
    title: '지역별 판매 실적',
    period: { start: '2024-12-01', end: '2024-12-31' },
    generatedAt: '2025-01-02T09:20:00+09:00',
    owner: '영업본부',
    status: 'archived',
  },
  {
    id: 'rep-007',
    title: '고객 CS 대응 현황',
    period: { start: '2025-01-01', end: '2025-01-07' },
    generatedAt: '2025-01-08T15:35:00+09:00',
    owner: '고객지원팀',
    status: 'published',
  },
  {
    id: 'rep-008',
    title: '매입 매출 비교 리포트',
    period: { start: '2024-12-25', end: '2025-01-07' },
    generatedAt: '2025-01-08T16:50:00+09:00',
    owner: '재무관리팀',
    status: 'draft',
  },
  {
    id: 'rep-009',
    title: '창고 가동률 분석',
    period: { start: '2025-01-01', end: '2025-01-07' },
    generatedAt: '2025-01-08T18:05:00+09:00',
    owner: '물류관리팀',
    status: 'published',
  },
  {
    id: 'rep-010',
    title: '리스크 모니터링 요약',
    period: { start: '2024-12-20', end: '2025-01-07' },
    generatedAt: '2025-01-08T19:20:00+09:00',
    owner: '경영지원실',
    status: 'draft',
  },
];

export default reports;
