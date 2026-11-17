"use strict";
// Window placement math (pure — no Electron; covered by tests/electron/windowPlacement.test.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeWindowAtPoint = placeWindowAtPoint;
// How far below the window's top edge the pointer lands: on its title bar, as if the
// window had been dragged there by it.
const GRAB_OFFSET_Y = 16;
/**
 * Bounds for a `width`×`height` window opened where something was dropped (a note dragged
 * out of the main window): centred horizontally on `point`, its title bar under it, moved
 * and shrunk as needed to stay whole inside `workArea` (the display's visible area).
 */
function placeWindowAtPoint(point, size, workArea) {
    const width = Math.min(size.width, workArea.width);
    const height = Math.min(size.height, workArea.height);
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    return {
        x: clamp(Math.round(point.x - width / 2), workArea.x, workArea.x + workArea.width - width),
        y: clamp(Math.round(point.y - GRAB_OFFSET_Y), workArea.y, workArea.y + workArea.height - height),
        width,
        height,
    };
}
