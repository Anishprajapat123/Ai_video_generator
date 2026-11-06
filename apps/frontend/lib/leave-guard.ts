export function allowLeavingEditor(dirty: boolean, pending: boolean, confirm: (message: string) => boolean, content = 'script') {
  if (pending) return false;
  return !dirty || confirm(`Leave this page and discard your unsaved ${content} changes?`);
}
