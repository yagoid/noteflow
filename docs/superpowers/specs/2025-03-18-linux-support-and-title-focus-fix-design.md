# Linux Support and Title Focus Fix - Design Spec

**Date:** 2025-03-18
**Status:** Approved Design
**Author:** Contributing Developer
**Target:** Version 1.2.0

## Overview

This spec adds comprehensive Linux support to NoteFlow (currently Windows-only) and fixes a UX bug where newly created notes don't focus the title field for immediate editing.

## Goals

1. **Bug Fix:** When creating a new note, automatically focus and select the title field so users can immediately type a name
2. **Linux Packaging:** Create `.deb` packages for Debian/Ubuntu/Kubuntu distributions
3. **Desktop Integration:** Full integration with Linux desktop environments (KDE, GNOME, etc.)
4. **Linux-Specific Features:** System theme detection, native notifications, KDE-friendly keyboard shortcuts
5. **Automated Releases:** Build and publish Linux packages alongside Windows in GitHub Actions

## Section 1: Title Focus Bug Fix

### Problem
When a user creates a new note (via `Ctrl+N` or "New note" button), the note is created and activated, but the title field is not focused. The user must manually click the title field to rename it, breaking the keyboard-first workflow.

### Solution
Add a mechanism to detect newly created notes and automatically focus the title input with text selected.

### Implementation

**1. Store State (`src/stores/notesStore.ts`)**
- Add `newlyCreatedNoteId: string | null` to the state interface
- In `createNote()`, after creating the note, set `newlyCreatedNoteId` to the new note's ID
- The flag persists until consumed by the UI

**2. UI Component (`src/components/Editor/NoteEditor.tsx`)**
- Add a `useEffect` that monitors `activeNoteId` changes
- When `activeNoteId` matches `newlyCreatedNoteId`:
  - Use `setTimeout(..., 0)` to ensure DOM updates complete
  - Call `titleRef.current?.focus()` to focus the title input
  - Call `titleRef.current?.select()` to select "Untitled" text
  - Clear `newlyCreatedNoteId` in the store

**3. Edge Cases**
- Only focus on newly created notes, not when switching between existing notes
- Handle case where note is deleted before effect runs
- Skip if title is already focused (prevent redundant focus)

### Success Criteria
- Pressing `Ctrl+N` immediately shows "Untitled" selected in title field
- Typing replaces "Untitled" without requiring manual click
- Switching between existing notes does NOT re-focus title

## Section 2: Linux Packaging

### Build Configuration

**package.json additions:**
```json
{
  "build": {
    "linux": {
      "target": ["deb"],
      "category": "Utility",
      "icon": "public/icon.png",
      "desktop": {
        "Name": "NoteFlow",
        "Comment": "Fast notes for software engineers",
        "Keywords": "notes;markdown;text;",
        "Categories": "Utility;TextEditor;"
      }
    },
    "deb": {
      "depends": [
        "libgtk-3-0",
        "libnotify4",
        "libnss3",
        "libxss1",
        "libxtst6",
        "xdg-utils",
        "libatspi2.0-0",
        "libdrm2",
        "libgbm1",
        "libxkbcommon0"
      ]
    }
  }
}
```

### Desktop Entry File

Create `public/noteflow.desktop` following freedesktop.org standards:
```ini
[Desktop Entry]
Name=NoteFlow
Comment=Fast notes for software engineers
GenericName=Note-taking Application
Keywords=notes;markdown;text;editor;
Exec=noteflow %U
Terminal=false
Type=Application
Icon=noteflow
Categories=Utility;TextEditor;
StartupNotify=true
StartupWMClass=noteflow
MimeType=text/markdown;
```

### File Associations

- Register `text/markdown` MIME type handler
- Allow opening `.md` files directly in NoteFlow
- Use existing freedesktop.org standards

### Success Criteria
- Running `npm run dist` generates `.deb` file in `release/` directory
- Package installs cleanly with `dpkg -i noteflow_1.1.0_amd64.deb`
- Application launches from terminal with `noteflow` command
- Application appears in desktop menu under "Utilities" and "Text Editors"

## Section 3: Linux-Specific Features

### System Theme Detection

Detect KDE/GNOME theme preference (dark/light) and apply appropriate app theme:

**Implementation in `electron/main.ts`:**
```typescript
import { nativeTheme } from 'electron'

// Detect system theme
nativeTheme.on('updated', () => {
  const isDark = nativeTheme.shouldUseDarkColors
  mainWindow?.webContents.send('theme-changed', isDark)
})
```

**Implementation in `src/main.tsx` or App component:**
- Listen for `theme-changed` events from main process
- Apply corresponding CSS class or theme context

### Native Notifications

Use Electron's `Notification` API which automatically uses native Linux notifications (libnotify):

```typescript
new Notification({
  title: 'NoteFlow',
  body: 'Note saved successfully'
}).show()
```

### Keyboard Shortcuts

Respect KDE conventions:
- `Ctrl+Q` → Quit application (already handled)
- `Ctrl+,` → Open settings (future feature)
- Ensure no conflicts with KDE reserved shortcuts

### Success Criteria
- App dark/light mode matches KDE system setting
- Notifications use native KDE notification style
- All keyboard shortcuts work without conflicts

## Section 4: Automated Release Workflow

### GitHub Actions Modifications

Update `.github/workflows/release.yml` to build for multiple platforms:

```yaml
strategy:
  matrix:
    os: [windows-latest, ubuntu-latest]
  fail-fast: false

runs-on: ${{ matrix.os }}

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '20'

  - name: Install dependencies
    run: npm ci

  - name: Build
    run: npm run dist

  - name: Upload artifacts
    uses: actions/upload-artifact@v4
    with:
      name: ${{ matrix.os }}-build
      path: release/*
```

### Release Process

1. Create GitHub release with tag (e.g., `v1.2.0`)
2. Workflow triggers on both Windows and Ubuntu runners
3. Each runner builds its respective package:
   - Windows: `.exe` installer
   - Linux: `.deb` package
4. Artifacts uploaded to release automatically

### Error Handling

- If Linux build fails, Windows build continues (fail-fast: false)
- Clear error messages in build logs
- Don't publish partial releases (all artifacts must succeed)

### Success Criteria
- Creating a GitHub release automatically generates both `.exe` and `.deb`
- Both artifacts are attached to the release
- Users can download and install either platform

## Section 5: Data Flow Diagrams

### New Note Creation Flow

```
User Action (Ctrl+N)
    ↓
createNote() called
    ↓
createEmptyNote() generates note object
    ↓
writeNote() saves to disk
    ↓
Set newlyCreatedNoteId = new note ID
    ↓
Set activeNoteId = new note ID
    ↓
Sidebar updates (shows new note active)
    ↓
NoteEditor useEffect detects activeNoteId change
    ↓
Check if activeNoteId === newlyCreatedNoteId
    ↓
Focus title input (titleRef.current?.focus())
    ↓
Select title text (titleRef.current?.select())
    ↓
Clear newlyCreatedNoteId
```

### Linux Build Flow

```
GitHub Release Created
    ↓
Workflow triggers (ubuntu-latest)
    ↓
npm ci (install dependencies)
    ↓
npm run dist
    ↓
electron-builder detects Linux target
    ↓
Builds .deb package with:
  - Electron runtime
  - Built application (dist/)
  - Desktop entry file
  - Icon file
  - File associations
    ↓
.deb file saved to release/
    ↓
Artifact uploaded to GitHub release
```

## Section 6: Error Handling

### Title Focus Errors

| Error | Handling |
|-------|----------|
| Note deleted before focus | Check note still exists before focusing |
| DOM not ready | Use setTimeout(..., 0) to defer until next tick |
| Title already focused | Check document.activeElement before focusing |
| new note ID not set | Log warning, continue normally |

### Build Errors

| Error | Handling |
|-------|----------|
| Missing system dependencies | Fail build early with clear error message |
| Icon file not found | Validate in pre-build step |
| Desktop entry invalid | Lint desktop file before packaging |
| Build fails (one OS) | Continue with other OS (fail-fast: false) |

### Runtime Errors

| Error | Handling |
|-------|----------|
| MIME registration fails | Log warning, app continues |
| Theme detection fails | Default to dark theme |
| Notification fails | Silent fail (notifications are optional) |

## Section 7: Testing Plan

### Manual Testing - Title Focus

- [ ] Create note with Ctrl+N → title focused and selected
- [ ] Create note with button → title focused and selected
- [ ] Type immediately → replaces "Untitled"
- [ ] Switch notes → title NOT re-focused
- [ ] Delete new note before focus → no errors

### Manual Testing - Linux Package

- [ ] `npm run dist` generates `.deb` file
- [ ] `dpkg -i noteflow_*.deb` installs successfully
- [ ] `noteflow` command launches app
- [ ] `dpkg -r noteflow` uninstalls cleanly

### Manual Testing - Desktop Integration

- [ ] NoteFlow in application menu
- [ ] Right-click `.md` → "Open with NoteFlow" works
- [ ] Double-click `.md` → opens in NoteFlow
- [ ] Icon displays in taskbar/launcher
- [ ] App categorized correctly (Utilities/Text Editor)

### Manual Testing - Linux Features

- [ ] Dark mode follows system theme
- [ ] Notifications use native KDE style
- [ ] Keyboard shortcuts work (no conflicts)
- [ ] Ctrl+Q quits cleanly

### Automated Testing

- [ ] GitHub Actions workflow passes
- [ ] Release contains both `.exe` and `.deb`
- [ ] Linux runner builds without errors
- [ ] Windows runner still works (regression check)

## Section 8: Implementation Checklist

### Phase 1: Bug Fix
- [ ] Add `newlyCreatedNoteId` to `notesStore.ts` state
- [ ] Modify `createNote()` to set the flag
- [ ] Add focus/select effect in `NoteEditor.tsx`
- [ ] Test title focus on new notes
- [ ] Verify existing note switching is unaffected

### Phase 2: Linux Packaging
- [ ] Add Linux build config to `package.json`
- [ ] Create `public/noteflow.desktop` file
- [ ] Verify icon exists at `public/icon.png`
- [ ] Test local build with `npm run dist`
- [ ] Install and test on Kubuntu

### Phase 3: Linux Features
- [ ] Add theme detection in `electron/main.ts`
- [ ] Add theme listener in React app
- [ ] Implement native notifications where appropriate
- [ ] Verify keyboard shortcuts
- [ ] Test dark/light mode switching

### Phase 4: CI/CD
- [ ] Update `.github/workflows/release.yml`
- [ ] Add matrix strategy for OS
- [ ] Test workflow with draft release
- [ ] Verify both artifacts upload

### Phase 5: Testing & Documentation
- [ ] Complete manual testing checklist
- [ ] Update README.md with Linux install instructions
- [ ] Test on fresh Kubuntu installation
- [ ] Create pull request

## Section 9: Rollout Plan

1. **Development:** Implement all changes on feature branch
2. **Testing:** Manual testing on Kubuntu + automated CI tests
3. **Documentation:** Update README with Linux instructions
4. **Pull Request:** Submit for review
5. **Release:** Merge and publish v1.2.0 with Linux support

## Section 10: Future Enhancements (Out of Scope)

- AppImage for universal Linux support
- .rpm packages for Fedora/RHEL
- Snap package for Ubuntu
- Flatpak for sandboxed distribution
- AUR package for Arch Linux
- Auto-updates for Linux builds
- Package repository hosting

## References

- [electron-builder Linux Configuration](https://www.electron.build/configuration/linux)
- [freedesktop.org Desktop Entry Spec](https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html)
- [freedesktop.org MIME Types](https://www.freedesktop.org/wiki/Specifications/shared-mime-info-spec/)
- [Electron Native Theme API](https://www.electronjs.org/docs/latest/api/native-theme)
