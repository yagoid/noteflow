import { describe, it, expect } from 'vitest'
import { placeWindowAtPoint } from '../../electron/windowPlacement'

// A note dragged out of the main window opens its window where it was dropped.

describe('placeWindowAtPoint', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  const size = { width: 760, height: 680 }

  it('centres the window on the pointer, its title bar under it', () => {
    expect(placeWindowAtPoint({ x: 1000, y: 200 }, size, workArea)).toEqual({ x: 620, y: 184, width: 760, height: 680 })
  })

  it('stays whole inside the work area near its edges', () => {
    expect(placeWindowAtPoint({ x: 10, y: 5 }, size, workArea)).toEqual({ x: 0, y: 0, width: 760, height: 680 })
    expect(placeWindowAtPoint({ x: 1915, y: 1035 }, size, workArea)).toEqual({ x: 1160, y: 360, width: 760, height: 680 })
  })

  it('works on a display that is not at the origin', () => {
    const second = { x: -1280, y: 40, width: 1280, height: 984 }
    expect(placeWindowAtPoint({ x: -1270, y: 30 }, size, second)).toEqual({ x: -1280, y: 40, width: 760, height: 680 })
  })

  it('shrinks to a work area smaller than the window', () => {
    const small = { x: 0, y: 0, width: 600, height: 500 }
    expect(placeWindowAtPoint({ x: 300, y: 250 }, size, small)).toEqual({ x: 0, y: 0, width: 600, height: 500 })
  })
})
