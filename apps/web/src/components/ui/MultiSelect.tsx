import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from './form'

export interface MultiSelectOption {
  value: string
  label: string
}

/**
 * 带搜索框的多选下拉：勾选多个选项，底部支持自定义操作（如"新增人员"）。
 * 下拉面板通过 Portal 渲染到 body（fixed 定位、高 z-index），
 * 避免被弹窗等 overflow 滚动容器裁剪；滚动 / 视口变化时跟随触发按钮重定位。
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = '请选择…',
  searchPlaceholder = '搜索…',
  footer,
  onFooterClick,
}: {
  value: string[]
  onChange: (value: string[]) => void
  options: MultiSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  /** 下拉底部的自定义操作文字/内容（如"＋ 新增人员…"） */
  footer?: React.ReactNode
  /** 点击底部操作行时触发（整个行均可点击，点击后自动关闭下拉） */
  onFooterClick?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null)

  // 面板定位：基于触发按钮位置，向下弹出；若下方空间不足则向上
  const updatePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelH = 320 // 搜索+列表+底部的估算高度
    const openUp = r.bottom + panelH > window.innerHeight && r.top > panelH
    setPanelStyle({
      position: 'fixed',
      left: r.left,
      width: r.width,
      ...(openUp
        ? { bottom: window.innerHeight - r.top - 4 }
        : { top: r.bottom + 4 }),
    })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    // 滚动 / 缩放时跟随重定位（capture 捕获弹窗内部滚动）
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      // 触发按钮自身由其 onClick 处理切换；面板已在 body 下，单独判断
      if (rootRef.current?.contains(t) || document.getElementById('__multiselect_panel__')?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 打开时重置搜索词
  useEffect(() => {
    if (open) setKeyword('')
  }, [open])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return kw ? options.filter((o) => o.label.toLowerCase().includes(kw)) : options
  }, [options, keyword])

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  const panel = open && panelStyle && (
    <div
      id="__multiselect_panel__"
      style={{ ...panelStyle, zIndex: 9999 }}
      className="fixed rounded-md border border-gray-200 bg-white shadow-lg"
    >
      <div className="border-b border-gray-100 p-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 text-sm"
          autoFocus
        />
      </div>
      <div className="max-h-52 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-gray-400">无匹配人员</div>
        ) : (
          filtered.map((o) => {
            const checked = value.includes(o.value)
            return (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 rounded border-gray-300"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="truncate">{o.label}</span>
              </label>
            )
          })
        )}
      </div>
      {footer && (
        <div
          className="cursor-pointer border-t border-gray-100 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
          onClick={() => {
            setOpen(false)
            onFooterClick?.()
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )

  return (
    <div ref={rootRef} className="relative">
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
      >
        {value.length === 0 ? (
          <span className="px-1 text-gray-400">{placeholder}</span>
        ) : (
          value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
            >
              {labelOf(v)}
              <span
                role="button"
                tabIndex={-1}
                className="text-blue-400 hover:text-blue-700 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(v)
                }}
              >
                ×
              </span>
            </span>
          ))
        )}
        <span className="ml-auto shrink-0 px-1 text-gray-400">▾</span>
      </button>
      {createPortal(panel, document.body)}
    </div>
  )
}
