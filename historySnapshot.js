// All edits in App.tsx replace a file object; prior snapshot entries remain immutable.
// Comparing references avoids rescanning megabytes of unchanged HTML on undo.
export function sameFileSnapshot(a, b) {
  return a === b || (a.length === b.length && a.every((file, index) => file === b[index]));
}
