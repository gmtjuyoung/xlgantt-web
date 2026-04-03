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

    // Helper: get project_id from task_id
    async function getProjectIdFromTask(taskId: string): Promise<string | null> {
      const { data } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', taskId)
        .single()
      return data?.project_id ?? null
    }

    // Helper: get project_id from detail id
    async function getProjectIdFromDetail(detailId: string): Promise<{ projectId: string | null; taskId: string | null }> {
      const { data } = await supabase
        .from('task_details')
        .select('task_id, tasks!inner(project_id)')
        .eq('id', detailId)
        .single()
      if (!data) return { projectId: null, taskId: null }
      return {
        projectId: (data as any).tasks?.project_id ?? null,
        taskId: data.task_id,
      }
    }

    // ──────────────────────────────────────
    // GET: 세부항목 목록
    // ──────────────────────────────────────
    if (method === 'GET') {
      const taskId = url.searchParams.get('task_id')
      if (!taskId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'task_id is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const projectId = await getProjectIdFromTask(taskId)
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Task not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        .from('task_details')
        .select('*')
        .eq('task_id', taskId)
        .order('sort_order', { ascending: true })

      if (error) throw error

      return new Response(
        JSON.stringify({ data, count: data.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // POST: 세부항목 생성
    // ──────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const { task_id, title } = body

      if (!task_id || !title) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'task_id and title are required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const projectId = await getProjectIdFromTask(task_id)
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Task not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, projectId, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get max sort_order
      const { data: maxSort } = await supabase
        .from('task_details')
        .select('sort_order')
        .eq('task_id', task_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      const nextOrder = (maxSort?.sort_order ?? 0) + 1

      const insert: Record<string, any> = {
        task_id,
        title,
        sort_order: nextOrder,
      }

      const optionalFields = ['description', 'status', 'assignee_ids', 'due_date']
      for (const field of optionalFields) {
        if (body[field] !== undefined) {
          insert[field] = body[field]
        }
      }

      const { data, error } = await supabase
        .from('task_details')
        .insert(insert)
        .select()
        .single()

      if (error) throw error

      await supabase.from('activity_logs').insert({
        project_id: projectId,
        user_id: userId,
        action: 'created',
        entity_type: 'task_detail',
        entity_id: data.id,
        details: { title, task_id },
      })

      return new Response(
        JSON.stringify({ data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // PATCH: 세부항목 수정 / 완료처리 / 상태변경
    // ──────────────────────────────────────
    if (method === 'PATCH') {
      const detailId = url.searchParams.get('id')
      if (!detailId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { projectId, taskId } = await getProjectIdFromDetail(detailId)
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Detail not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, projectId, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const action = url.searchParams.get('action')

      // action=complete: 완료 처리
      if (action === 'complete') {
        const { data, error } = await supabase
          .from('task_details')
          .update({
            status: 'done',
            updated_at: new Date().toISOString(),
          })
          .eq('id', detailId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('activity_logs').insert({
          project_id: projectId,
          user_id: userId,
          action: 'completed',
          entity_type: 'task_detail',
          entity_id: detailId,
          details: { title: data.title, task_id: taskId },
        })

        return new Response(
          JSON.stringify({ data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // action=status: 상태 변경
      if (action === 'status') {
        const body = await req.json()
        const { status } = body

        if (!status || !['todo', 'in_progress', 'done'].includes(status)) {
          return new Response(
            JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: "status must be 'todo', 'in_progress', or 'done'", status: 400 } }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data, error } = await supabase
          .from('task_details')
          .update({ status })
          .eq('id', detailId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('activity_logs').insert({
          project_id: projectId,
          user_id: userId,
          action: 'status_changed',
          entity_type: 'task_detail',
          entity_id: detailId,
          details: { new_status: status, title: data.title },
        })

        return new Response(
          JSON.stringify({ data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // General update (no action param)
      const body = await req.json()
      const allowedFields = ['title', 'description', 'status', 'assignee_ids', 'due_date', 'sort_order']
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
        .from('task_details')
        .update(updates)
        .eq('id', detailId)
        .select()
        .single()

      if (error) throw error

      await supabase.from('activity_logs').insert({
        project_id: projectId,
        user_id: userId,
        action: 'updated',
        entity_type: 'task_detail',
        entity_id: detailId,
        details: { updated_fields: Object.keys(updates) },
      })

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ──────────────────────────────────────
    // DELETE: 세부항목 삭제
    // ──────────────────────────────────────
    if (method === 'DELETE') {
      const detailId = url.searchParams.get('id')
      if (!detailId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'id query parameter is required', status: 400 } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { projectId } = await getProjectIdFromDetail(detailId)
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Detail not found', status: 404 } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const access = await checkProjectAccess(supabase, userId, projectId, 'editor')
      if (!access.allowed) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Editor role required', status: 403 } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabase
        .from('task_details')
        .delete()
        .eq('id', detailId)

      if (error) throw error

      return new Response(
        JSON.stringify({ data: { deleted: true, id: detailId } }),
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
