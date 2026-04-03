import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateRequest, checkProjectAccess } from '../_shared/auth.ts'
import { dispatchWebhooks } from '../_shared/webhook.ts'

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
    // GET: 작업 목록
    // ──────────────────────────────────────
    if (method === 'GET') {
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

      let query = supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      // overdue filter: planned_end < today AND actual_progress < 1
      const overdue = url.searchParams.get('overdue')
      if (overdue === 'true') {
        const today = new Date().toISOString().split('T')[0]
        query = query
          .lt('planned_end', today)
          .lt('actual_progress', 1)
          .not('planned_end', 'is', null)
      }

      const { data, error } = await query

      if (error) throw error

      return new Response(
        JSON.stringify({ data, count: data.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // POST: 작업 생성
    // ──────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const { project_id, task_name } = body

      if (!project_id || !task_name) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'project_id and task_name are required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, project_id, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get max sort_order for this project
      const { data: maxSort } = await supabase
        .from('tasks')
        .select('sort_order')
        .eq('project_id', project_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      const nextOrder = (maxSort?.sort_order ?? 0) + 1

      const allowedFields = [
        'project_id', 'task_name', 'wbs_code', 'wbs_level', 'is_group',
        'remarks', 'planned_start', 'planned_end', 'actual_start', 'actual_end',
        'total_workload', 'planned_workload', 'actual_workload',
        'total_duration', 'planned_duration', 'actual_duration',
        'calendar_type', 'resource_count', 'deliverables',
        'planned_progress', 'actual_progress', 'is_milestone',
        'parent_id', 'is_collapsed',
      ]

      const insert: Record<string, any> = { sort_order: nextOrder }
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          insert[field] = body[field]
        }
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert(insert)
        .select()
        .single()

      if (error) throw error

      await supabase.from('activity_logs').insert({
        project_id,
        user_id: userId,
        action: 'created',
        entity_type: 'task',
        entity_id: data.id,
        details: { task_name },
      })

      // Webhook: fire-and-forget
      dispatchWebhooks(supabase, project_id, 'task.created', {
        task_id: data.id,
        task_name: data.task_name,
        project_id,
      }).catch(() => {})

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // PATCH: 작업 수정
    // ──────────────────────────────────────
    if (method === 'PATCH') {
      const taskId = url.searchParams.get('id')
      if (!taskId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch task to get project_id
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', taskId)
        .single()

      if (fetchError || !task) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Task not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, task.project_id, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json()
      const allowedFields = [
        'sort_order', 'task_name', 'wbs_code', 'wbs_level', 'is_group',
        'remarks', 'planned_start', 'planned_end', 'actual_start', 'actual_end',
        'total_workload', 'planned_workload', 'actual_workload',
        'total_duration', 'planned_duration', 'actual_duration',
        'calendar_type', 'resource_count', 'deliverables',
        'planned_progress', 'actual_progress', 'is_milestone',
        'parent_id', 'is_collapsed',
      ]

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
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error

      await supabase.from('activity_logs').insert({
        project_id: task.project_id,
        user_id: userId,
        action: 'updated',
        entity_type: 'task',
        entity_id: taskId,
        details: { updated_fields: Object.keys(updates) },
      })

      // Webhook: fire-and-forget
      dispatchWebhooks(supabase, task.project_id, 'task.updated', {
        task_id: taskId,
        updated_fields: Object.keys(updates),
        task_name: data.task_name,
      }).catch(() => {})

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // DELETE: 작업 삭제
    // ──────────────────────────────────────
    if (method === 'DELETE') {
      const taskId = url.searchParams.get('id')
      if (!taskId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('project_id, task_name')
        .eq('id', taskId)
        .single()

      if (fetchError || !task) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Task not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, task.project_id, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error

      await supabase.from('activity_logs').insert({
        project_id: task.project_id,
        user_id: userId,
        action: 'deleted',
        entity_type: 'task',
        entity_id: taskId,
        details: { task_name: task.task_name },
      })

      // Webhook: fire-and-forget
      dispatchWebhooks(supabase, task.project_id, 'task.deleted', {
        task_id: taskId,
        task_name: task.task_name,
      }).catch(() => {})

      return new Response(
        JSON.stringify({ data: { deleted: true, id: taskId } }),
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
