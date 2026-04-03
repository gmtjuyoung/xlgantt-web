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

## 3. 웹훅 시스템

### 이벤트 목록
- task.created / task.updated / task.deleted
- detail.created / detail.status_changed / detail.completed
- assignment.created / assignment.deleted

### 구독 관리 API
| Method | Path | 설명 |
|--------|------|------|
| GET | /api-webhook-subscriptions?project_id={id} | 구독 목록 |
| POST | /api-webhook-subscriptions | 구독 생성 |
| PATCH | /api-webhook-subscriptions?id={id} | 구독 수정 |
| DELETE | /api-webhook-subscriptions?id={id} | 구독 삭제 |
| POST | /api-webhook-subscriptions?action=test&id={id} | 테스트 발행 |

### 디스패처 (내부 전용)
| Method | Path | 설명 |
|--------|------|------|
| POST | /api-webhook-dispatcher | 수동/테스트 웹훅 발행 |

### 발행 방식
- **방식 A 채택**: api-tasks, api-details Edge Function에서 CRUD 후 `_shared/webhook.ts`의 `dispatchWebhooks()` 직접 호출
- Fire-and-forget 방식 (실패해도 원본 API 응답에 영향 없음)
- HMAC-SHA256 서명 (`X-Webhook-Signature` 헤더)

### 페이로드 형식
```json
{
  "event": "task.created",
  "timestamp": "2026-04-03T09:00:00.000Z",
  "project_id": "uuid",
  "data": { ... }
}
```

### 서명 검증 (수신 측)
```
signature = HMAC-SHA256(secret, request_body)
X-Webhook-Signature 헤더 값과 비교
```

## 4. 구현 순서
1. Phase 1: DB 마이그레이션 + 인증 미들웨어
2. Phase 2: REST API Edge Functions
3. Phase 3: 웹훅 시스템
4. Phase 4: 텔레그램 봇
