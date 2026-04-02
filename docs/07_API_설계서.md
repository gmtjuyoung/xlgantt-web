# XLGantt 외부 연동 API 설계서

## 1. REST API 엔드포인트

### 인증
- JWT 토큰: `Authorization: Bearer <access_token>`
- API Key: `X-API-Key: <api_key>`

### Projects
| Method | Path | 설명 |
|--------|------|------|
| GET | /api-projects | 프로젝트 목록 |
| POST | /api-projects | 프로젝트 생성 |
| PATCH | /api-projects?id={id} | 프로젝트 수정 |

### Tasks
| Method | Path | 설명 |
|--------|------|------|
| GET | /api-tasks?project_id={id} | 작업 목록 |
| POST | /api-tasks | 작업 생성 |
| PATCH | /api-tasks?id={id} | 작업 수정 |

### Task Details (카드)
| Method | Path | 설명 |
|--------|------|------|
| GET | /api-details?task_id={id} | 세부항목 목록 |
| POST | /api-details | 세부항목 생성 |
| PATCH | /api-details?id={id}&action=complete | 완료 처리 |
| PATCH | /api-details?id={id}&action=status | 상태 변경 |

### Notifications
| Method | Path | 설명 |
|--------|------|------|
| GET | /api-notifications?type=overdue | 지연 작업 |
| GET | /api-notifications?type=due_soon&days=3 | 기한 임박 |
| GET | /api-notifications?type=my_pending | 내 미완료 |

## 2. 텔레그램 봇 명령어
- /start - 계정 연결 (이메일)
- /mytasks - 내 업무 목록
- /status [프로젝트] - 프로젝트 진척 현황
- /complete [카드제목] - 카드 완료 처리
- /add [작업명] > [항목명] - 새 세부항목 추가

## 3. 웹훅 이벤트
- task.created / task.updated / task.deleted
- detail.status_changed / detail.completed
- assignment.created / comment.created

## 4. 구현 순서
1. Phase 1: DB 마이그레이션 + 인증 미들웨어
2. Phase 2: REST API Edge Functions
3. Phase 3: 웹훅 시스템
4. Phase 4: 텔레그램 봇
