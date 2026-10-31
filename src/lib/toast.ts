/** A tiny toast store: one queue, read by the Toaster with useSyncExternalStore. */

export interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}

const LIFETIME_MS = { success: 4000, error: 8000 };
const EMPTY: readonly Toast[] = [];

let toasts: readonly Toast[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: readonly Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number) {
  publish(toasts.filter((toast) => toast.id !== id));
}

export function showToast(tone: Toast["tone"], message: string) {
  const id = nextId++;
  publish([...toasts.slice(-2), { id, tone, message }]);
  setTimeout(() => dismissToast(id), LIFETIME_MS[tone]);
}

export const getToasts = () => toasts;
export const getNoToasts = () => EMPTY;

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
