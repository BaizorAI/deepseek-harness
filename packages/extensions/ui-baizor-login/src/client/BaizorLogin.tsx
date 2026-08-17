/**
 * The sidebar footer badge and its waiting dialog. Starting one flow opens the
 * baizor.com sign-in page in a new tab and settles when the host poll answers;
 * the dialog then reports success or the failure with a retry.
 */

import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  IconCheckOutline16, IconGlobeOutline14, IconLinkOutline14, Modal, Tooltip, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { BaizorLoginFace } from './slots.ts'
import css from './BaizorLogin.module.css'

/** Full badge props composed by the sidebar footer-action slot. */
export type BaizorLoginProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<BaizorLoginFace> & PropsLocale<'baizorLogin'>

type Phase =
  | { name: 'closed' }
  | { name: 'running'; loginUrl: string; secondsLeft: number }
  | { name: 'done' }
  | { name: 'failed'; message: string }

function RowButton({ label, children, ...props }: {
  label: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button type="button" className={css.rowButton} aria-label={label} {...props}>
        {children}
      </button>
    </Tooltip>
  )
}

/** Render the Baizor AI login badge and its flow dialog. */
export function BaizorLogin({ wide, run, t }: BaizorLoginProps) {
  const [phase, setPhase] = useState<Phase>({ name: 'closed' })
  const [copied, setCopied] = useState(false)
  const countdown = useRef<number | undefined>(undefined)

  const clearCountdown = (): void => {
    window.clearInterval(countdown.current)
    countdown.current = undefined
  }

  useEffect(() => () => { clearCountdown() }, [])

  const begin = async (): Promise<void> => {
    if (phase.name === 'running') return
    setCopied(false)
    const flow = await run()
    if (!flow.direction.ok) {
      setPhase({ name: 'failed', message: flow.direction.message })
      return
    }
    setPhase({
      name: 'running',
      loginUrl: flow.direction.loginUrl,
      secondsLeft: Math.ceil(flow.direction.timeoutMs / 1000),
    })
    clearCountdown()
    countdown.current = window.setInterval(() => {
      setPhase(current => current.name === 'running'
        ? { name: 'running', loginUrl: current.loginUrl, secondsLeft: Math.max(0, current.secondsLeft - 1) }
        : current)
    }, 1000)
    const result = await flow.settle
    clearCountdown()
    if (result.ok) setPhase({ name: 'done' })
    else setPhase({ name: 'failed', message: result.message })
  }

  const close = (): void => {
    clearCountdown()
    setPhase({ name: 'closed' })
  }

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <Modal
        open={phase.name !== 'closed'}
        onClose={close}
        title={t('panel.title')}
        closeLabel={t('panel.close')}
        {...phase.name === 'running' ? { description: t('panel.opened') } : {}}
        footer={
          phase.name === 'running' || phase.name === 'failed' ? (
            <button type="button" className={css.again} onClick={() => { void begin() }}>
              {t('panel.again')}
            </button>
          ) : undefined
        }
      >
        {phase.name === 'running' && (
          <div className={css.waiting}>
            <RowButton
              label={t('panel.copy')}
              onClick={() => {
                void writeClipboard(phase.loginUrl).then((ok) => { setCopied(ok) })
              }}
            >
              <IconLinkOutline14 />
            </RowButton>
            <span className={css.waitingText}>{t('panel.waiting', { seconds: phase.secondsLeft })}</span>
            {copied && <span className={css.copied}>{t('panel.copied')}</span>}
          </div>
        )}
        {phase.name === 'done' && (
          <div className={css.result} role="status">
            <IconCheckOutline16 />
            <span>{t('panel.done')}</span>
          </div>
        )}
        {phase.name === 'failed' && (
          <div className={css.failed} role="alert">{t('panel.failed', { message: phase.message })}</div>
        )}
      </Modal>
      <div className={css.footerButtons}>
        <button
          type="button"
          className={css.badge}
          data-baizor-login
          data-baizor-waiting={phase.name === 'running' || undefined}
          aria-label={t('trigger.aria')}
          onClick={() => { void begin() }}
        >
          <IconGlobeOutline14 />
          {wide && <span className={css.badgeLabel}>{t('trigger')}</span>}
        </button>
      </div>
    </div>
  )
}
