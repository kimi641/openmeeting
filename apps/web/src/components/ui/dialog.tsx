import { useEffect, type ReactNode } from 'react'
import { Button } from './button'
import { cn } from '../../lib/utils'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Dialog({ open, title, onClose, children, footer, wide }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'relative max-h-[85vh] w-full overflow-y-auto rounded-lg bg-white shadow-xl',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function DialogFooter({ onCancel, onConfirm, confirmText = '确定', loading, danger }: {
  onCancel: () => void
  onConfirm: () => void
  confirmText?: string
  loading?: boolean
  danger?: boolean
}) {
  return (
    <>
      <Button variant="outline" onClick={onCancel} disabled={loading}>
        取消
      </Button>
      <Button variant={danger ? 'danger' : 'default'} onClick={onConfirm} disabled={loading}>
        {loading ? '提交中…' : confirmText}
      </Button>
    </>
  )
}
