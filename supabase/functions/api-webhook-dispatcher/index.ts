/**
 * XLGantt - Webhook Dispatcher Edge Function
 *
 * 내부 전용 엔드포인트: CRUD API에서 호출하여 웹훅을 발행합니다.
 * 외부에서 직접 호출하지 않고, api-tasks / api-details 등에서
 * _shared/webhook.ts의 dispatchWebhooks()를 직접 import하여 사용합니다.
 *
 * 이 Edge Function은 수동/테스트 발행용으로도 활용할 수 있습니다.
 *
 * POST /api-webhook-dispatcher
 * Headers:
 *   Authorization: Bearer <service_role_key>
 * Body:
 *   { "project_id": "...", "event": "task.created", "data": {...} }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { dispatchWebhooks, type WebhookEvent } from "../_shared/webhook.ts";

const VALID_EVENTS: WebhookEvent[] = [
  "task.created",
  "task.updated",
  "task.deleted",
  "detail.created",
  "detail.status_changed",
  "detail.completed",
  "assignment.created",
  "assignment.deleted",
];

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // POST만 허용
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // service_role 키로 인증 (내부 호출 전용)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { project_id, event, data } = body;

    // 입력 검증
    if (!project_id || typeof project_id !== "string") {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!event || !VALID_EVENTS.includes(event as WebhookEvent)) {
      return new Response(
        JSON.stringify({
          error: `Invalid event. Valid events: ${VALID_EVENTS.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!data || typeof data !== "object") {
      return new Response(
        JSON.stringify({ error: "data object is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 웹훅 발행 (fire-and-forget이지만, 이 엔드포인트에서는 결과 대기)
    await dispatchWebhooks(
      supabase,
      project_id,
      event as WebhookEvent,
      data,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Webhook event '${event}' dispatched for project ${project_id}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[api-webhook-dispatcher] Error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
