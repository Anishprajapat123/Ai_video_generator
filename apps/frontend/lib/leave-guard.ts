export function allowLeavingEditor(dirty: boolean, pending: boolean, confirm: (message: string) => boolean) {
  if (pending) return false;
  return !dirty || confirm('Leave this page and discard your unsaved script changes?');
}
