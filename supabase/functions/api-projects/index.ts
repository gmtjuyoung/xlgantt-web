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

    // ──────────────────────────────────────
    // GET: 프로젝트 목록 (본인이 멤버인 프로젝트만)
    // ──────────────────────────────────────
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          project_members!inner(user_id, role)
        `)
        .eq('project_members.user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // project_members 내부 조인 결과에서 본인 role 추출
      const projects = data.map((p: any) => {
        const myMembership = p.project_members?.find((m: any) => m.user_id === userId)
        const { project_members, ...rest } = p
        return { ...rest, my_role: myMembership?.role ?? 'viewer' }
      })

      return new Response(
        JSON.stringify({ data: projects, count: projects.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // POST: 프로젝트 생성
    // ──────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const { name, description, start_date, end_date, theme_id, language, zoom_level } = body

      if (!name || !start_date || !end_date) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'name, start_date, end_date are required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name,
          description: description ?? null,
          start_date,
          end_date,
          owner_id: userId,
          theme_id: theme_id ?? 0,
          language: language ?? 'ko',
          zoom_level: zoom_level ?? 2,
        })
        .select()
        .single()

      if (error) throw error

      // activity log
      await supabase.from('activity_logs').insert({
        project_id: data.id,
        user_id: userId,
        action: 'created',
        entity_type: 'project',
        entity_id: data.id,
        details: { name },
      })

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // PATCH: 프로젝트 수정
    // ──────────────────────────────────────
    if (method === 'PATCH') {
      const projectId = url.searchParams.get('id')
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, projectId, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json()
      const allowedFields = ['name', 'description', 'start_date', 'end_date', 'theme_id', 'language', 'zoom_level', 'status_date']
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

      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .select()
        .single()

      if (error) throw error

      await supabase.from('activity_logs').insert({
        project_id: projectId,
        user_id: userId,
        action: 'updated',
        entity_type: 'project',
        entity_id: projectId,
        details: { updated_fields: Object.keys(updates) },
      })

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // DELETE: 프로젝트 삭제
    // ──────────────────────────────────────
    if (method === 'DELETE') {
      const projectId = url.searchParams.get('id')
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, projectId, 'owner')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Owner role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error

      return new Response(
        JSON.stringify({ data: { deleted: true, id: projectId } }),
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
