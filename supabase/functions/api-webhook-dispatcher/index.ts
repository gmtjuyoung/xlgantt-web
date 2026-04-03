/**
 * XLGantt - Webhook Dispatcher Edge Function
 *
 * 수동/테스트 웹훅 발행 전용 엔드포인트.
 * 일반적으로 api-tasks / api-details에서 _shared/webhook.ts를
 * 직접 import하여 자동 발행하므로, 이 엔드포인트는 디버깅/테스트용입니다.
 *
 * POST /api-webhook-dispatcher
 * Headers:
 *   Authorization: Bearer <jwt_token> 또는 X-API-Key: <api_key>
 * Body:
 *   { "project_id": "...", "event": "task.created", "data": {...} }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateRequest, checkProjectAccess } from '../_shared/auth.ts'
import { dispatchWebhooks, type WebhookEvent } from '../_shared/webhook.ts'

const VALID_EVENTS: WebhookEvent[] = [
  'task.created',
  'task.updated',
  'task.deleted',
  'detail.created',
  'detail.status_changed',
  'detail.completed',
  'assignment.created',
  'assignment.deleted',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed', status: 405 } }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const auth = await authenticateRequest(req)
    if ('error' in auth) {
      return new Response(JSON.stringify(auth), {
        status: auth.error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { userId, supabase } = auth
    const body = await req.json()
    const { project_id, event, data } = body

    // 입력 검증
    if (!project_id || typeof project_id !== 'string') {
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'project_id is required', status: 400 } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 프로젝트 owner 권한 확인
    const access = await checkProjectAccess(supabase, userId, project_id, 'owner')
    if (!access.allowed) {
      return new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Owner role required for manual webhook dispatch', status: 403 } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!event || !VALID_EVENTS.includes(event as WebhookEvent)) {
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: `Invalid event. Valid: ${VALID_EVENTS.join(', ')}`, status: 400 } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!data || typeof data !== 'object') {
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'data object is required', status: 400 } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 웹훅 발행 (이 엔드포인트에서는 결과 대기)
    await dispatchWebhooks(supabase, project_id, event as WebhookEvent, data)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Webhook event '${event}' dispatched for project ${project_id}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[api-webhook-dispatcher] Error:', err)
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message, status: 500 } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
