// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TaskMenuPopover, type TaskMenuValues } from '../../src/components/Editor/TaskPickers'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let trigger: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  trigger?.remove()
  root = null
  trigger = null
})

function mount(values: TaskMenuValues) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  trigger = document.createElement('button')
  document.body.appendChild(trigger)
  const container = document.createElement('div')
  trigger.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(TaskMenuPopover, { trigger: trigger!, ...values, onChange, onClose }))
  })
  const menu = document.querySelector<HTMLElement>('.task-menu')!
  return { menu, onChange, onClose }
}

/** Types a value into a controlled input the way React sees it. */
function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const none: TaskMenuValues = { due: null, alarm: null, importance: null }

describe('TaskMenuPopover', () => {
  it('writes the importance picked in the segmented row', () => {
    const { menu, onChange } = mount(none)
    const radios = menu.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    expect(radios).toHaveLength(4)
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    act(() => radios[3].click())
    expect(onChange).toHaveBeenCalledWith({ importance: 'high' })
  })

  it('focuses the selected importance on open', () => {
    const { menu } = mount({ ...none, importance: 'medium' })
    expect(document.activeElement).toBe(menu.querySelector('[role="radio"][aria-checked="true"]'))
  })

  it('writes a shortcut date and keeps the alarm', () => {
    const { menu, onChange } = mount({ due: '2020-01-01', alarm: '09:00', importance: null })
    act(() => menu.querySelector<HTMLButtonElement>('.task-menu-quick-row--tomorrow')!.click())
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Object.keys(onChange.mock.calls[0][0])).toEqual(['due'])
  })

  it('does not write the partial years a date input reports while typing', () => {
    const { menu, onChange } = mount(none)
    const date = menu.querySelector<HTMLInputElement>('input[type="date"]')!
    setInput(date, '0002-11-17')
    expect(onChange).not.toHaveBeenCalled()
    setInput(date, '2026-11-17')
    expect(onChange).toHaveBeenCalledWith({ due: '2026-11-17' })
  })

  it('disables the alarm without a deadline', () => {
    const { menu } = mount(none)
    expect(menu.querySelector<HTMLInputElement>('input[type="time"]')!.disabled).toBe(true)
  })

  it('clears the deadline with its alarm, and everything with "Clear all"', () => {
    const { menu, onChange } = mount({ due: '2026-11-17', alarm: '09:00', importance: 'low' })
    act(() => menu.querySelector<HTMLButtonElement>('.task-menu-head-action')!.click())
    expect(onChange).toHaveBeenLastCalledWith({ due: null, alarm: null })
    act(() => menu.querySelector<HTMLButtonElement>('.task-menu-clear-all')!.click())
    expect(onChange).toHaveBeenLastCalledWith({ due: null, alarm: null, importance: null })
  })

  it('closes on Escape (back to the text) and on a click outside (focus stays)', () => {
    const { onClose } = mount(none)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenLastCalledWith(true)
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenLastCalledWith(false)
  })

  it('ignores a click on its trigger (the trigger toggles it)', () => {
    const { onClose } = mount(none)
    act(() => {
      trigger!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
