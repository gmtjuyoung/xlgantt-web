/**
 * XLGantt Webhook Dispatch Engine
 *
 * 방식 A 채택: CRUD API에서 직접 호출하는 fire-and-forget 웹훅 발행 모듈.
 * - HMAC-SHA256 서명으로 페이로드 무결성 보장
 * - 발행 실패가 원본 요청에 영향을 주지 않음
 * - webhook_logs 테이블에 발행 결과 기록
 *
 * 지원 이벤트:
 *   task.created / task.updated / task.deleted
 *   detail.created / detail.status_changed / detail.completed
 *   assignment.created / assignment.deleted
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Types
// ============================================================

export type WebhookEvent =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "detail.created"
  | "detail.status_changed"
  | "detail.completed"
  | "assignment.created"
  | "assignment.deleted";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  project_id: string;
  data: Record<string, unknown>;
}

interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}

interface DeliveryResult {
  subscription_id: string;
  success: boolean;
  response_status?: number;
  response_body?: string;
  duration_ms: number;
}

// ============================================================
// HMAC-SHA256 서명
// ============================================================

/**
 * HMAC-SHA256으로 페이로드를 서명합니다.
 * Web Crypto API (Deno 내장) 사용.
 *
 * @param secret - 구독자별 시크릿 키
 * @param payload - 서명할 JSON 문자열
 * @returns hex 인코딩된 서명 문자열
 */
export async function hmacSign(
  secret: string,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * HMAC-SHA256 서명을 검증합니다.
 *
 * 수신 측에서 사용하는 예제:
 *
 * ```typescript
 * import { hmacVerify } from "./_shared/webhook.ts";
 *
 * const signature = request.headers.get("X-Webhook-Signature") ?? "";
 * const body = await request.text();
 * const isValid = await hmacVerify(YOUR_SECRET, body, signature);
 * if (!isValid) {
 *   return new Response("Invalid signature", { status: 401 });
 * }
 * ```
 *
 * @param secret - 구독 시 발급받은 시크릿 키
 * @param payload - 수신한 원본 request body 문자열
 * @param signature - X-Webhook-Signature 헤더 값
 * @returns 서명 일치 여부
 */
export async function hmacVerify(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  const expected = await hmacSign(secret, payload);
  // timing-safe comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================
// 단일 구독자 배달
// ============================================================

const DELIVERY_TIMEOUT_MS = 10_000; // 10초 타임아웃

async function deliverToSubscriber(
  sub: WebhookSubscription,
  payload: string,
): Promise<DeliveryResult> {
  const start = performance.now();
  try {
    const signature = await hmacSign(sub.secret, payload);
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DELIVERY_TIMEOUT_MS,
    );

    const response = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": JSON.parse(payload).event,
        "User-Agent": "XLGantt-Webhook/1.0",
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Math.round(performance.now() - start);

    // 응답 body는 최대 1KB만 기록
    let responseBody = "";
    try {
      responseBody = (await response.text()).slice(0, 1024);
    } catch {
      // body 읽기 실패는 무시
    }

    return {
      subscription_id: sub.id,
      success: response.ok,
      response_status: response.status,
      response_body: responseBody,
      duration_ms: duration,
    };
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    return {
      subscription_id: sub.id,
      success: false,
      response_status: 0,
      response_body: err instanceof Error ? err.message : String(err),
      duration_ms: duration,
    };
  }
}

// ============================================================
// 웹훅 발행 메인 함수
// ============================================================

/**
 * 프로젝트의 활성 웹훅 구독자에게 이벤트를 발행합니다.
 * Fire-and-forget 방식으로, 발행 실패가 호출자에게 전파되지 않습니다.
 *
 * 사용 예:
 * ```typescript
 * import { dispatchWebhooks } from "../_shared/webhook.ts";
 *
 * // task 생성 후
 * dispatchWebhooks(supabaseAdmin, projectId, "task.created", {
 *   task_id: newTask.id,
 *   task_name: newTask.task_name,
 * });
 * ```
 *
 * @param supabase - Supabase 클라이언트 (service_role 권한 권장)
 * @param projectId - 이벤트가 발생한 프로젝트 ID
 * @param event - 웹훅 이벤트 타입
 * @param data - 이벤트 상세 데이터
 */
export async function dispatchWebhooks(
  supabase: SupabaseClient,
  projectId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    // 1. 해당 프로젝트 + 이벤트에 매칭되는 활성 구독자 조회
    const { data: subs, error } = await supabase
      .from("webhook_subscriptions")
      .select("id, url, secret, events, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (error) {
      console.error("[Webhook] Subscription query failed:", error.message);
      return;
    }

    // events 배열에 해당 이벤트가 포함된 구독자만 필터
    const matchedSubs = (subs as WebhookSubscription[])?.filter(
      (s) => s.events.includes(event) || s.events.includes("*"),
    );

    if (!matchedSubs?.length) return;

    // 2. 페이로드 생성
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      project_id: projectId,
      data,
    };
    const payloadStr = JSON.stringify(payload);

    // 3. 각 구독자에게 병렬 배달 (fire-and-forget)
    const deliveries = matchedSubs.map((sub) =>
      deliverToSubscriber(sub, payloadStr),
    );

    // 전부 완료 대기 후 로그 기록
    const results = await Promise.allSettled(deliveries);

    // 4. 배달 결과를 webhook_logs에 기록
    const logEntries = results
      .filter(
        (r): r is PromiseFulfilledResult<DeliveryResult> =>
          r.status === "fulfilled",
      )
      .map((r) => ({
        subscription_id: r.value.subscription_id,
        event,
        payload: payload as unknown as Record<string, unknown>,
        response_status: r.value.response_status,
        response_body: r.value.response_body,
        success: r.value.success,
        duration_ms: r.value.duration_ms,
      }));

    if (logEntries.length > 0) {
      const { error: logError } = await supabase
        .from("webhook_logs")
        .insert(logEntries);

      if (logError) {
        console.error("[Webhook] Log insert failed:", logError.message);
      }
    }

    console.log(
      `[Webhook] Dispatched ${event} to ${matchedSubs.length} subscriber(s) for project ${projectId}`,
    );
  } catch (err) {
    // fire-and-forget: 에러를 로그만 남기고 전파하지 않음
    console.error("[Webhook] Dispatch error:", err);
  }
}
