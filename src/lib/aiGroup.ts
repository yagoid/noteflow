// Notes the AI generates land in a single, fixed group so they're easy to find and keep
// separate from the user's own notes. The fixed name doubles as the cross-machine signal
// that a profile exists: groups.json and each note's `group` field both sync, so any PC can
// tell the profile is done just by finding a note in this group — no local-only flag needed.
export const AI_GROUP_NAME = 'IA Generated'

/** Whether a group name is the AI group's (the match ignores case and surrounding spaces). */
export function isAiGroupName(name: string): boolean {
  return name.trim().toLowerCase() === AI_GROUP_NAME.toLowerCase()
}
