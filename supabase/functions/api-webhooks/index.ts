import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateRequest } from '../_shared/auth.ts'

/** Generate a random hex string for webhook secret */
function generateSecret(length = 32): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    const url = new URL(req.url)
    const method = req.method

    // ──────────────────────────────────────
    // GET: 내 웹훅 구독 목록
    // ──────────────────────────────────────
    if (method === 'GET') {
      const projectId = url.searchParams.get('project_id')

      let query = supabase
        .from('webhook_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { data, error } = await query

      if (error) throw error

      return new Response(
        JSON.stringify({ data, count: data.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // POST: 웹훅 구독 등록
    // ──────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const { project_id, url: webhookUrl, events } = body

      if (!project_id || !webhookUrl || !events || !Array.isArray(events)) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'project_id, url, and events[] are required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate URL format
      try {
        new URL(webhookUrl)
      } catch {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook URL', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate event names
      const validEvents = [
        'task.created', 'task.updated', 'task.deleted',
        'detail.status_changed', 'detail.completed',
        'assignment.created', 'comment.created',
      ]
      const invalidEvents = events.filter((e: string) => !validEvents.includes(e))
      if (invalidEvents.length > 0) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: `Invalid events: ${invalidEvents.join(', ')}`, status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const secret = generateSecret()

      const { data, error } = await supabase
        .from('webhook_subscriptions')
        .insert({
          user_id: userId,
          project_id,
          url: webhookUrl,
          secret,
          events,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      // Return secret only on creation (won't be shown again)
      return new Response(
        JSON.stringify({ data: { ...data, secret_plain: secret } }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // PATCH: 웹훅 구독 수정
    // ──────────────────────────────────────
    if (method === 'PATCH') {
      const subscriptionId = url.searchParams.get('id')
      if (!subscriptionId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify ownership
      const { data: existing, error: fetchError } = await supabase
        .from('webhook_subscriptions')
        .select('user_id')
        .eq('id', subscriptionId)
        .single()

      if (fetchError || !existing) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Webhook subscription not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (existing.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not your subscription', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json()
      const allowedFields = ['url', 'events', 'is_active']
      const updates: Record<string, any> = {}
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field]
        }
      }

      if (Object.keys(updates).length === 0) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate URL if provided
      if (updates.url) {
        try {
          new URL(updates.url)
        } catch {
          return new Response(
            JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook URL', status: 400 } }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      const { data, error } = await supabase
        .from('webhook_subscriptions')
        .update(updates)
        .eq('id', subscriptionId)
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // DELETE: 웹훅 구독 삭제
    // ──────────────────────────────────────
    if (method === 'DELETE') {
      const subscriptionId = url.searchParams.get('id')
      if (!subscriptionId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify ownership
      const { data: existing, error: fetchError } = await supabase
        .from('webhook_subscriptions')
        .select('user_id')
        .eq('id', subscriptionId)
        .single()

      if (fetchError || !existing) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Webhook subscription not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (existing.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not your subscription', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabase
        .from('webhook_subscriptions')
        .delete()
        .eq('id', subscriptionId)

      if (error) throw error

      return new Response(
        JSON.stringify({ data: { deleted: true, id: subscriptionId } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed`, status: 405 } }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message, status: 500 } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
