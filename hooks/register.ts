import type { EngineInterface as Engine, Register, SessionRateLimit } from 'claude-code'

const MESSAGE = 'המשך'
const BUFFER_MS = 60_000            // דקה אחרי שעת האיפוס
const FALLBACK_MS = 15 * 60_000     // אין שעת איפוס ידועה: לנסות כל 15 דקות
const MAX_TRIES = 8

type Pending = { at: number; tries: number }

let timer: { cancel: () => void } | undefined

function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
}

// החלון החסום שמתאפס אחרון
function blockedReset(limits: readonly SessionRateLimit[]): number | undefined {
  return limits
    .filter(w => w.percentUsed >= 100 && w.resetsAt)
    .map(w => Date.parse(w.resetsAt!))
    .filter(t => !isNaN(t))
    .sort((a, b) => b - a)[0]
}

async function storeKey($: Engine): Promise<string> {
  return `pending:${await $.session.id()}`
}

async function readPending($: Engine): Promise<Pending | undefined> {
  return (await $.store.get(await storeKey($))) as Pending | undefined
}

async function schedule($: Engine, p: Pending): Promise<void> {
  timer?.cancel()
  await $.store.set(await storeKey($), p)
  const now = await $.clock.now()
  $.ui.status(`המשך אוטומטי: "${MESSAGE}" ב-${fmt(p.at)}`)
  timer = $.clock.after(Math.max(1000, p.at - now), () => void fire($))
}

async function clear($: Engine, note?: string): Promise<void> {
  timer?.cancel()
  timer = undefined
  await $.store.delete(await storeKey($))
  $.ui.status(undefined)
  if (note) $.ui.toast(note)
}

async function fire($: Engine): Promise<void> {
  const p = await readPending($)
  if (!p) return
  const now = await $.clock.now()
  const reset = blockedReset((await $.session.usage()).rateLimits)
  if (reset && reset + BUFFER_MS > now) {
    await schedule($, { ...p, at: reset + BUFFER_MS }) // עדיין חסום – לדחות
    return
  }
  await $.store.set(await storeKey($), { tries: p.tries + 1, at: now + FALLBACK_MS })
  $.ui.status(undefined)
  $.ui.toast(`המשך אוטומטי: שולח "${MESSAGE}"`)
  void $.prompt.submit({ text: MESSAGE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'auto-continue',
      description: 'המשך אוטומטי: מצב, cancel לביטול, now לשליחה מיידית',
    })
    const p = await readPending($)
    if (p) await schedule($, p) // אחרי טעינה מחדש
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const res = await next(e)
    if (e.agentId) return res

    const p = await readPending($)
    if (e.reason !== 'error') {
      if (p && p.tries > 0) await clear($, 'המשך אוטומטי: המשימה ממשיכה ✓')
      return res
    }

    const limits = (await $.session.usage()).rateLimits
    const reset = blockedReset(limits)
    const isLimit = reset !== undefined || limits.some(w => w.percentUsed >= 100)
    if (!isLimit && !p) return res // שגיאה שאינה מגבלת שימוש

    const tries = p?.tries ?? 0
    if (tries >= MAX_TRIES) {
      await clear($, 'המשך אוטומטי: הפסקתי אחרי כמה ניסיונות – כדאי לבדוק ידנית')
      return res
    }
    const at = reset ? reset + BUFFER_MS : (await $.clock.now()) + FALLBACK_MS
    await schedule($, { at, tries })
    $.ui.toast(`נגמרו המשאבים – "${MESSAGE}" יישלח אוטומטית ב-${fmt(at)}`)
    return res
  })

  on('command.run', { command: 'auto-continue' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'cancel') {
      await clear($)
      return { text: 'ההמתנה בוטלה.' }
    }
    if (arg === 'now') {
      if (!(await readPending($))) await $.store.set(await storeKey($), { at: 0, tries: 0 })
      void fire($)
      return { text: `שולח "${MESSAGE}" עכשיו.` }
    }
    const p = await readPending($)
    return {
      text: p
        ? `ממתין: "${MESSAGE}" יישלח ב-${fmt(p.at)} (ניסיון ${p.tries + 1}).`
        : 'אין המתנה פעילה. המוד יתעורר כשמגבלת שימוש תעצור משימה.',
    }
  })
}
