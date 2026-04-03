import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateRequest, checkProjectAccess } from '../_shared/auth.ts'

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

    if (method !== 'GET') {
      return new Response(
        JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed', status: 405 } }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const projectId = url.searchParams.get('project_id')
    if (!projectId) {
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'project_id is required', status: 400 } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const access = await checkProjectAccess(supabase, userId, projectId)
    if (!access.allowed) {
      return new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not a project member', status: 403 } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    // Optional filters
    const entityType = url.searchParams.get('entity_type')
    const action = url.searchParams.get('action')

    let query = supabase
      .from('activity_logs')
      .select(`
        *,
        profiles:user_id(name, email, avatar_url)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }
    if (action) {
      query = query.eq('action', action)
    }

    const { data, error } = await query

    if (error) throw error

    // Get total count
    let countQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    if (entityType) {
      countQuery = countQuery.eq('entity_type', entityType)
    }
    if (action) {
      countQuery = countQuery.eq('action', action)
    }

    const { count: totalCount } = await countQuery

    return new Response(
      JSON.stringify({
        data,
        count: data.length,
        total: totalCount ?? 0,
        limit,
        offset,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message, status: 500 } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
