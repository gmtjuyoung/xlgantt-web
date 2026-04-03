/**
 * 텔레그램 Bot API 래퍼
 */

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`

/**
 * 텔레그램 메시지 전송
 */
export async function sendMessage(
  chatId: number,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    })
    const result = await resp.json()
    if (!result.ok) {
      console.error('Telegram sendMessage failed:', result.description)
      return false
    }
    return true
  } catch (err) {
    console.error('Telegram sendMessage error:', err)
    return false
  }
}

/**
 * 텔레그램 Webhook URL 설정 (배포 후 1회 호출)
 */
export async function setWebhook(webhookUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    })
    const result = await resp.json()
    return result.ok === true
  } catch (err) {
    console.error('Telegram setWebhook error:', err)
    return false
  }
}

/**
 * 날짜 포맷 (MM/DD)
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 지연 일수 계산
 */
export function getDaysOverdue(dateStr: string): number {
  const due = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}
