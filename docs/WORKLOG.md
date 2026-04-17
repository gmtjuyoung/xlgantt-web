# WORKLOG

## 2026-04-16 12:25 (KST) - Direction C Phase1~2 시작
- 작업자: Claude
- 상태: 적용
- 브랜치 대상: `gmtgantt` (worktree: `xlgantt-web-master`)
- 목표: 계획/실적 진척률 자동 계산 + 수동 override 기반 구조 도입
- 변경:
  - `tasks` override 컬럼 대응 타입 추가
  - 자동 계산 유틸(`task-progress.ts`) 추가
  - task-store에 계획 자동 계산/그룹 롤업/override 반영 로직 추가
  - 세부항목 자동 진척률 계산 시 실적 override 존중하도록 수정
  - 테이블에 `🔒 수동` 배지 표시
  - status_date 변경 시 계획 진척률 재계산 트리거 추가
  - Supabase migration `007_progress_overrides.sql` 추가
- 검증:
  - `npm run build` 시도
  - 현재 worktree에 `node_modules`가 없어 `tsc` 실행 불가로 빌드 검증은 미완료
- 다음 액션:
  - 의존성 설치 후 타입/빌드 검증
  - TaskEditDialog에 계획진척률 override 입력 UX 정리

