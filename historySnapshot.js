// Most edits preserve unchanged file object references. Compare those first,
// falling back to the three ProcessedFile fields when a transformation rebuilds
// an otherwise identical object. This retains the old deep-equality no-op behavior.
export function sameFileSnapshot(a, b) {
  return a === b || (a.length === b.length && a.every((file, index) => {
    const other = b[index];
    return file === other || (file.name === other.name &&
      file.content === other.content && file.originalName === other.originalName);
  }));
}
