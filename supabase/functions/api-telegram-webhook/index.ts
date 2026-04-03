import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMessage, formatDate, getDaysOverdue } from '../_shared/telegram.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// ============================================================
// 텔레그램 Webhook 수신 엔드포인트
// ============================================================

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const update = await req.json()
    const message = update.message
    if (!message?.text) {
      return new Response('ok')
    }

    const chatId: number = message.chat.id
    const text: string = message.text.trim()
    const senderName: string = message.from?.first_name ?? '사용자'

    // 명령어 라우팅
    if (text.startsWith('/start')) {
      await handleStart(chatId, senderName)
    } else if (text.startsWith('/mytasks')) {
      await handleMyTasks(chatId)
    } else if (text.startsWith('/status')) {
      await handleStatus(chatId, text)
    } else if (text.startsWith('/complete')) {
      await handleComplete(chatId, text)
    } else if (text.startsWith('/add')) {
      await handleAdd(chatId, text)
    } else if (text.startsWith('/help')) {
      await handleHelp(chatId)
    } else if (text.includes('@')) {
      // 이메일 형식이면 계정 연결 시도
      await handleEmailLink(chatId, text)
    } else {
      await sendMessage(chatId,
        '알 수 없는 명령입니다. /help 로 사용법을 확인하세요.'
      )
    }

    return new Response('ok')
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('ok')
  }
})

// ============================================================
// /start - 계정 연결 안내
// ============================================================
async function handleStart(chatId: number, name: string) {
  await sendMessage(chatId,
    `안녕하세요 <b>${escapeHtml(name)}</b>님! XLGantt 봇입니다.\n\n` +
    `계정을 연결하려면 XLGantt에 등록된 이메일을 입력해주세요.\n\n` +
    `예: <code>hong@company.com</code>\n\n` +
    `명령어 목록은 /help 를 입력하세요.`
  )
}

// ============================================================
// 이메일로 계정 연결
// ============================================================
async function handleEmailLink(chatId: number, email: string) {
  const trimmedEmail = email.trim().toLowerCase()

  // team_members 테이블에서 이메일로 검색
  const { data: members, error } = await supabase
    .from('team_members')
    .select('id, name, email')
    .ilike('email', trimmedEmail)

  if (error || !members || members.length === 0) {
    // profiles 테이블에서도 시도
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, name, email')
      .ilike('email', trimmedEmail)
      .single()

    if (pErr || !profile) {
      await sendMessage(chatId,
        `해당 이메일(<code>${escapeHtml(trimmedEmail)}</code>)로 등록된 사용자를 찾을 수 없습니다.\n` +
        `XLGantt에 가입된 이메일을 입력해주세요.`
      )
      return
    }

    // profiles에 telegram_chat_id 업데이트
    await supabase
      .from('profiles')
      .update({ telegram_chat_id: chatId })
      .eq('id', profile.id)

    await sendMessage(chatId,
      `✅ 계정이 연결되었습니다!\n\n` +
      `<b>${escapeHtml(profile.name || trimmedEmail)}</b>님, 환영합니다.\n` +
      `/mytasks 로 업무를 확인해보세요.`
    )
    return
  }

  // team_members에 telegram_chat_id 업데이트 (모든 매칭 건)
  for (const member of members) {
    await supabase
      .from('team_members')
      .update({ telegram_chat_id: chatId })
      .eq('id', member.id)
  }

  const memberName = members[0].name || trimmedEmail
  await sendMessage(chatId,
    `✅ 계정이 연결되었습니다!\n\n` +
    `<b>${escapeHtml(memberName)}</b>님, 환영합니다.` +
    (members.length > 1 ? ` (${members.length}개 프로젝트)` : '') + `\n` +
    `/mytasks 로 업무를 확인해보세요.`
  )
}

// ============================================================
// /mytasks - 내 업무 목록
// ============================================================
async function handleMyTasks(chatId: number) {
  // team_members에서 chatId로 사용자 찾기
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, company_id')
    .eq('telegram_chat_id', chatId)

  if (!members || members.length === 0) {
    await sendMessage(chatId,
      '계정이 연결되지 않았습니다. 이메일을 입력하여 계정을 연결해주세요.'
    )
    return
  }

  const memberIds = members.map((m) => m.id)
  const memberName = members[0].name

  // task_assignments를 통해 배정된 tasks 조회
  const { data: assignments } = await supabase
    .from('task_assignments')
    .select(`
      task_id,
      tasks!inner (
        id, task_name, project_id, planned_end, actual_progress, is_group,
        projects!inner ( name )
      )
    `)
    .in('member_id', memberIds)

  if (!assignments || assignments.length === 0) {
    await sendMessage(chatId,
      `📋 <b>${escapeHtml(memberName)}</b>님에게 배정된 업무가 없습니다.`
    )
    return
  }

  // task_details도 조회 (assignee_ids에 포함된 것)
  const { data: details } = await supabase
    .from('task_details')
    .select('id, title, status, due_date, task_id')
    .or(memberIds.map((id) => `assignee_ids.cs.{${id}}`).join(','))

  // 프로젝트별로 그룹화
  const projectMap = new Map<string, {
    projectName: string
    todo: number
    inProgress: number
    done: number
    activeItems: Array<{ name: string; dueDate: string | null; overdue: number }>
    overdueItems: Array<{ name: string; dueDate: string; overdue: number }>
  }>()

  for (const a of assignments) {
    const task = a.tasks as any
    if (!task || task.is_group) continue

    const projectId = task.project_id
    const projectName = task.projects?.name ?? '(프로젝트 없음)'

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, {
        projectName,
        todo: 0, inProgress: 0, done: 0,
        activeItems: [], overdueItems: [],
      })
    }

    const proj = projectMap.get(projectId)!
    const progress = Number(task.actual_progress ?? 0)
    const taskName = task.task_name

    if (progress >= 1) {
      proj.done++
    } else if (progress > 0) {
      proj.inProgress++
      proj.activeItems.push({
        name: taskName,
        dueDate: task.planned_end,
        overdue: 0,
      })

      // 지연 체크
      if (task.planned_end && new Date(task.planned_end) < new Date()) {
        const days = getDaysOverdue(task.planned_end)
        if (days > 0) {
          proj.overdueItems.push({ name: taskName, dueDate: task.planned_end, overdue: days })
        }
      }
    } else {
      proj.todo++
    }
  }

  // task_details 카운트 추가
  if (details) {
    for (const d of details) {
      // task_details에서 소속 프로젝트 찾기 (assignments의 task_id와 매칭)
      const parentAssignment = assignments.find((a) => (a.tasks as any)?.id === d.task_id)
      if (!parentAssignment) continue

      const task = parentAssignment.tasks as any
      const projectId = task.project_id
      const proj = projectMap.get(projectId)
      if (!proj) continue

      const parentTaskName = task.task_name

      if (d.status === 'in_progress') {
        proj.activeItems.push({
          name: `${parentTaskName} > ${d.title}`,
          dueDate: d.due_date,
          overdue: 0,
        })
      }

      if (d.due_date && d.status !== 'done' && new Date(d.due_date) < new Date()) {
        const days = getDaysOverdue(d.due_date)
        if (days > 0) {
          proj.overdueItems.push({
            name: `${parentTaskName} > ${d.title}`,
            dueDate: d.due_date,
            overdue: days,
          })
        }
      }
    }
  }

  // 메시지 구성
  let msg = `📋 <b>${escapeHtml(memberName)}</b>님의 업무 현황\n`

  for (const [, proj] of projectMap) {
    msg += `\n<b>[${escapeHtml(proj.projectName)}]</b>\n`
    msg += ` 대기: ${proj.todo}건 | 진행중: ${proj.inProgress}건 | 완료: ${proj.done}건\n`

    if (proj.activeItems.length > 0) {
      msg += `\n▶ <b>진행중 업무:</b>\n`
      for (let i = 0; i < Math.min(proj.activeItems.length, 10); i++) {
        const item = proj.activeItems[i]
        msg += ` ${i + 1}. ${escapeHtml(item.name)} (기한: ${formatDate(item.dueDate)})\n`
      }
      if (proj.activeItems.length > 10) {
        msg += ` ... 외 ${proj.activeItems.length - 10}건\n`
      }
    }

    if (proj.overdueItems.length > 0) {
      msg += `\n⚠ <b>지연 업무:</b>\n`
      for (let i = 0; i < Math.min(proj.overdueItems.length, 10); i++) {
        const item = proj.overdueItems[i]
        msg += ` ${i + 1}. ${escapeHtml(item.name)} (기한: ${formatDate(item.dueDate)}, ${item.overdue}일 지연)\n`
      }
    }
  }

  await sendMessage(chatId, msg)
}

// ============================================================
// /status [프로젝트명] - 프로젝트 진척 현황
// ============================================================
async function handleStatus(chatId: number, text: string) {
  const projectQuery = text.replace(/^\/status\s*/i, '').trim()

  if (!projectQuery) {
    await sendMessage(chatId,
      '사용법: <code>/status 프로젝트명</code>\n예: <code>/status ABC 프로젝트</code>'
    )
    return
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date')
    .ilike('name', `%${projectQuery}%`)
    .limit(5)

  if (!projects || projects.length === 0) {
    await sendMessage(chatId,
      `"${escapeHtml(projectQuery)}" 프로젝트를 찾을 수 없습니다.`
    )
    return
  }

  let msg = ''

  for (const project of projects) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, task_name, actual_progress, planned_end, is_group')
      .eq('project_id', project.id)
      .eq('is_group', false)

    if (!tasks) continue

    const total = tasks.length
    const done = tasks.filter((t) => Number(t.actual_progress) >= 1).length
    const inProgress = tasks.filter((t) => {
      const p = Number(t.actual_progress)
      return p > 0 && p < 1
    }).length
    const todo = total - done - inProgress
    const overdue = tasks.filter((t) =>
      t.planned_end && new Date(t.planned_end) < new Date() && Number(t.actual_progress) < 1
    ).length

    const overallProgress = total > 0
      ? (tasks.reduce((sum, t) => sum + Number(t.actual_progress ?? 0), 0) / total * 100).toFixed(1)
      : '0.0'

    const progressBar = getProgressBar(Number(overallProgress))

    msg += `📊 <b>${escapeHtml(project.name)}</b>\n`
    msg += `${progressBar} ${overallProgress}%\n`
    msg += `기간: ${formatDate(project.start_date)} ~ ${formatDate(project.end_date)}\n\n`
    msg += `전체: ${total}건\n`
    msg += ` ✅ 완료: ${done}건 | ▶ 진행: ${inProgress}건 | ⏳ 대기: ${todo}건\n`
    if (overdue > 0) {
      msg += ` ⚠ 지연: ${overdue}건\n`
    }
    msg += '\n'
  }

  await sendMessage(chatId, msg.trim())
}

// ============================================================
// /complete [카드제목] - 카드 완료 처리
// ============================================================
async function handleComplete(chatId: number, text: string) {
  const titleQuery = text.replace(/^\/complete\s*/i, '').trim()

  if (!titleQuery) {
    await sendMessage(chatId,
      '사용법: <code>/complete 카드 제목</code>\n예: <code>/complete DB 스키마 검증</code>'
    )
    return
  }

  // 본인의 team_member ID 조회
  const { data: members } = await supabase
    .from('team_members')
    .select('id')
    .eq('telegram_chat_id', chatId)

  if (!members || members.length === 0) {
    await sendMessage(chatId, '계정이 연결되지 않았습니다. 이메일을 입력하여 연결해주세요.')
    return
  }

  const memberIds = members.map((m) => m.id)

  // task_details에서 title ILIKE 검색 (본인 배정 건 또는 본인 task 배정 건)
  const { data: details } = await supabase
    .from('task_details')
    .select(`
      id, title, status, task_id,
      tasks!inner ( id, task_name, project_id )
    `)
    .ilike('title', `%${titleQuery}%`)
    .neq('status', 'done')
    .limit(10)

  if (!details || details.length === 0) {
    await sendMessage(chatId,
      `"${escapeHtml(titleQuery)}" 항목을 찾을 수 없습니다.`
    )
    return
  }

  // 본인 배정 건만 필터 (assignee_ids에 포함되거나, task_assignments에 있는 건)
  const { data: myAssignments } = await supabase
    .from('task_assignments')
    .select('task_id')
    .in('member_id', memberIds)

  const myTaskIds = new Set((myAssignments ?? []).map((a) => a.task_id))

  const myDetails = details.filter((d) => {
    // assignee_ids에 내 member_id가 포함되어 있거나
    // task_assignments를 통해 부모 task에 배정되어 있는 건
    return myTaskIds.has(d.task_id)
  })

  if (myDetails.length === 0) {
    await sendMessage(chatId,
      `"${escapeHtml(titleQuery)}" 항목 중 본인에게 배정된 건이 없습니다.`
    )
    return
  }

  if (myDetails.length > 1) {
    let msg = `여러 항목이 검색되었습니다. 더 정확한 제목을 입력해주세요:\n\n`
    for (let i = 0; i < myDetails.length; i++) {
      const d = myDetails[i]
      const task = d.tasks as any
      msg += `${i + 1}. ${escapeHtml(task?.task_name ?? '')} > ${escapeHtml(d.title)}\n`
    }
    await sendMessage(chatId, msg)
    return
  }

  // 단일 매칭: 완료 처리
  const detail = myDetails[0]
  const { error } = await supabase
    .from('task_details')
    .update({
      status: 'done',
      updated_at: new Date().toISOString(),
    })
    .eq('id', detail.id)

  if (error) {
    await sendMessage(chatId, `완료 처리 중 오류가 발생했습니다: ${error.message}`)
    return
  }

  const task = detail.tasks as any
  await sendMessage(chatId,
    `✅ 완료 처리되었습니다!\n\n` +
    `<b>${escapeHtml(task?.task_name ?? '')}</b> > ${escapeHtml(detail.title)}`
  )
}

// ============================================================
// /add [작업명] > [항목명] - 새 세부항목 추가
// ============================================================
async function handleAdd(chatId: number, text: string) {
  const content = text.replace(/^\/add\s*/i, '').trim()
  const parts = content.split('>').map((s) => s.trim())

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    await sendMessage(chatId,
      '사용법: <code>/add 작업명 &gt; 항목명</code>\n예: <code>/add DB 설계 &gt; 인덱스 최적화</code>'
    )
    return
  }

  const taskQuery = parts[0]
  const detailTitle = parts[1]

  // tasks에서 task_name ILIKE 검색
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, task_name, project_id')
    .ilike('task_name', `%${taskQuery}%`)
    .eq('is_group', false)
    .limit(5)

  if (!tasks || tasks.length === 0) {
    await sendMessage(chatId,
      `"${escapeHtml(taskQuery)}" 작업을 찾을 수 없습니다.`
    )
    return
  }

  if (tasks.length > 1) {
    let msg = `여러 작업이 검색되었습니다. 더 정확한 이름을 입력해주세요:\n\n`
    for (let i = 0; i < tasks.length; i++) {
      msg += `${i + 1}. ${escapeHtml(tasks[i].task_name)}\n`
    }
    await sendMessage(chatId, msg)
    return
  }

  const task = tasks[0]

  // 현재 최대 sort_order 조회
  const { data: maxOrder } = await supabase
    .from('task_details')
    .select('sort_order')
    .eq('task_id', task.id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const newOrder = maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order + 1 : 0

  // task_details INSERT
  const { error } = await supabase
    .from('task_details')
    .insert({
      task_id: task.id,
      title: detailTitle,
      sort_order: newOrder,
      status: 'todo',
    })

  if (error) {
    await sendMessage(chatId, `항목 추가 중 오류가 발생했습니다: ${error.message}`)
    return
  }

  await sendMessage(chatId,
    `✅ 새 항목이 추가되었습니다!\n\n` +
    `<b>${escapeHtml(task.task_name)}</b> > ${escapeHtml(detailTitle)}`
  )
}

// ============================================================
// /help - 도움말
// ============================================================
async function handleHelp(chatId: number) {
  const helpText =
    `📖 <b>XLGantt 봇 명령어</b>\n\n` +
    `/start - 봇 시작 및 계정 연결 안내\n` +
    `/mytasks - 내 업무 목록 조회\n` +
    `/status [프로젝트명] - 프로젝트 진척 현황\n` +
    `/complete [카드제목] - 카드 완료 처리\n` +
    `/add [작업명] &gt; [항목명] - 새 세부항목 추가\n` +
    `/help - 이 도움말\n\n` +
    `<b>계정 연결:</b>\n` +
    `XLGantt에 등록된 이메일을 직접 입력하면 계정이 연결됩니다.`

  await sendMessage(chatId, helpText)
}

// ============================================================
// 유틸리티
// ============================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getProgressBar(percent: number): string {
  const filled = Math.round(percent / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}
