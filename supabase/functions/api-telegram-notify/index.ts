import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMessage, formatDate, getDaysOverdue } from '../_shared/telegram.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// ============================================================
// 텔레그램 정기 알림 (cron 또는 수동 호출)
// - 기한 임박 (due_date <= today + 3일)
// - 지연 경고 (planned_end < today && actual_progress < 1)
// ============================================================

Deno.serve(async (req) => {
  // CORS 처리
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const soon = new Date(today)
    soon.setDate(soon.getDate() + 3)
    const soonStr = soon.toISOString().split('T')[0]

    // telegram_chat_id가 있는 team_members 조회
    const { data: linkedMembers } = await supabase
      .from('team_members')
      .select('id, name, telegram_chat_id, company_id')
      .not('telegram_chat_id', 'is', null)

    if (!linkedMembers || linkedMembers.length === 0) {
      return jsonResponse({ sent: 0, message: 'No linked telegram users' })
    }

    let totalSent = 0

    for (const member of linkedMembers) {
      const chatId = member.telegram_chat_id as number
      const memberName = member.name

      // 1) 배정된 task 중 지연 건 (planned_end < today && actual_progress < 1)
      const { data: overdueAssignments } = await supabase
        .from('task_assignments')
        .select(`
          tasks!inner (
            id, task_name, planned_end, actual_progress, is_group,
            projects!inner ( name )
          )
        `)
        .eq('member_id', member.id)

      const overdueTasks = (overdueAssignments ?? [])
        .map((a) => a.tasks as any)
        .filter((t) =>
          t && !t.is_group &&
          t.planned_end &&
          t.planned_end < todayStr &&
          Number(t.actual_progress ?? 0) < 1
        )

      // 2) 기한 임박 task_details (due_date between today and today+3)
      const { data: dueSoonDetails } = await supabase
        .from('task_details')
        .select(`
          id, title, due_date, status, task_id,
          tasks!inner (
            id, task_name,
            projects!inner ( name )
          )
        `)
        .contains('assignee_ids', [member.id])
        .neq('status', 'done')
        .gte('due_date', todayStr)
        .lte('due_date', soonStr)

      // 3) 기한 임박 tasks (배정 건 중)
      const dueSoonTasks = (overdueAssignments ?? [])
        .map((a) => a.tasks as any)
        .filter((t) =>
          t && !t.is_group &&
          t.planned_end &&
          t.planned_end >= todayStr &&
          t.planned_end <= soonStr &&
          Number(t.actual_progress ?? 0) < 1
        )

      // 알림 메시지 구성
      const hasOverdue = overdueTasks.length > 0
      const hasDueSoon = dueSoonTasks.length > 0 || (dueSoonDetails?.length ?? 0) > 0

      if (!hasOverdue && !hasDueSoon) continue

      let msg = `🔔 <b>${escapeHtml(memberName)}</b>님의 알림\n`

      if (hasOverdue) {
        msg += `\n⚠ <b>지연 업무 (${overdueTasks.length}건)</b>\n`
        for (let i = 0; i < Math.min(overdueTasks.length, 10); i++) {
          const t = overdueTasks[i]
          const days = getDaysOverdue(t.planned_end)
          msg += ` • ${escapeHtml(t.projects?.name ?? '')} > ${escapeHtml(t.task_name)}`
          msg += ` (${days}일 지연)\n`
        }
        if (overdueTasks.length > 10) {
          msg += ` ... 외 ${overdueTasks.length - 10}건\n`
        }
      }

      if (hasDueSoon) {
        const count = dueSoonTasks.length + (dueSoonDetails?.length ?? 0)
        msg += `\n📅 <b>기한 임박 (${count}건, 3일 이내)</b>\n`

        for (let i = 0; i < Math.min(dueSoonTasks.length, 10); i++) {
          const t = dueSoonTasks[i]
          msg += ` • ${escapeHtml(t.projects?.name ?? '')} > ${escapeHtml(t.task_name)}`
          msg += ` (기한: ${formatDate(t.planned_end)})\n`
        }

        for (const d of (dueSoonDetails ?? []).slice(0, 5)) {
          const task = d.tasks as any
          msg += ` • ${escapeHtml(task?.task_name ?? '')} > ${escapeHtml(d.title)}`
          msg += ` (기한: ${formatDate(d.due_date)})\n`
        }
      }

      const sent = await sendMessage(chatId, msg)
      if (sent) totalSent++
    }

    return jsonResponse({ sent: totalSent, total: linkedMembers.length })
  } catch (err) {
    console.error('Notify error:', err)
    return jsonResponse(
      { error: 'Internal Server Error', message: String(err) },
      500
    )
  }
})

// ============================================================
// 유틸리티
// ============================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
