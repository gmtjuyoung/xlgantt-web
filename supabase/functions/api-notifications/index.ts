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

    const type = url.searchParams.get('type')
    if (!type) {
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: "type is required (overdue, due_soon, my_pending)", status: 400 } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    // ──────────────────────────────────────
    // type=overdue: 지연 작업 (planned_end < today, progress < 1)
    // ──────────────────────────────────────
    if (type === 'overdue') {
      const projectId = url.searchParams.get('project_id')
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'project_id is required for overdue', status: 400 } }),
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

      const { data, error } = await supabase
        .from('tasks')
        .select('id, task_name, planned_end, actual_progress, wbs_code')
        .eq('project_id', projectId)
        .lt('planned_end', today)
        .lt('actual_progress', 1)
        .not('planned_end', 'is', null)
        .eq('is_group', false)
        .order('planned_end', { ascending: true })

      if (error) throw error

      const notifications = data.map((task: any) => ({
        ...task,
        days_overdue: Math.floor(
          (new Date(today).getTime() - new Date(task.planned_end).getTime()) / (1000 * 60 * 60 * 24)
        ),
        severity: (() => {
          const days = Math.floor(
            (new Date(today).getTime() - new Date(task.planned_end).getTime()) / (1000 * 60 * 60 * 24)
          )
          if (days > 14) return 'critical'
          if (days > 7) return 'high'
          if (days > 3) return 'medium'
          return 'low'
        })(),
      }))

      return new Response(
        JSON.stringify({ data: notifications, count: notifications.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // type=due_soon: 기한 임박
    // ──────────────────────────────────────
    if (type === 'due_soon') {
      const projectId = url.searchParams.get('project_id')
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'project_id is required for due_soon', status: 400 } }),
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

      const days = parseInt(url.searchParams.get('days') ?? '3', 10)
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + days)
      const futureDateStr = futureDate.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('tasks')
        .select('id, task_name, planned_end, actual_progress, wbs_code')
        .eq('project_id', projectId)
        .gte('planned_end', today)
        .lte('planned_end', futureDateStr)
        .lt('actual_progress', 1)
        .not('planned_end', 'is', null)
        .eq('is_group', false)
        .order('planned_end', { ascending: true })

      if (error) throw error

      const notifications = data.map((task: any) => ({
        ...task,
        days_remaining: Math.floor(
          (new Date(task.planned_end).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
        ),
      }))

      return new Response(
        JSON.stringify({ data: notifications, count: notifications.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // type=my_pending: 내 미완료 세부항목
    // ──────────────────────────────────────
    if (type === 'my_pending') {
      const memberId = url.searchParams.get('member_id')
      if (!memberId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'member_id is required for my_pending', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get details where this member is assigned and not done
      const { data, error } = await supabase
        .from('task_details')
        .select(`
          id, title, status, due_date, sort_order,
          tasks!inner(id, task_name, project_id)
        `)
        .contains('assignee_ids', [memberId])
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })

      if (error) throw error

      const notifications = data.map((detail: any) => ({
        detail_id: detail.id,
        title: detail.title,
        status: detail.status,
        due_date: detail.due_date,
        task_name: detail.tasks?.task_name,
        project_id: detail.tasks?.project_id,
        is_overdue: detail.due_date ? new Date(detail.due_date) < new Date(today) : false,
      }))

      return new Response(
        JSON.stringify({ data: notifications, count: notifications.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: "Unknown type. Use 'overdue', 'due_soon', or 'my_pending'", status: 400 } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message, status: 500 } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
