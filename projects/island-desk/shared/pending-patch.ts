/** Merge edits across fields until they are sent, or discard them when an item is deleted. */
export function pendingPatch<T extends object>(send: (patch: Partial<T>) => void, delay: number) {
  let pending: Partial<T> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; pending = undefined; };
  const flush = () => {
    const patch = pending;
    cancel();
    if (patch) send(patch);
  };
  return {
    push(patch: Partial<T>) {
      pending = { ...pending, ...patch };
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel,
  };
}
