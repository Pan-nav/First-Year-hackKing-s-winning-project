// Tiny event bus. Every module talks through this. Event names and payloads: docs/CONTRACT.md
const target = new EventTarget();

export const bus = {
  /** Listen for an event. Returns a function that removes the listener. */
  on(type, handler) {
    const wrapped = (e) => handler(e.detail);
    target.addEventListener(type, wrapped);
    return () => target.removeEventListener(type, wrapped);
  },
  /** Fire an event with a payload object. */
  emit(type, detail = {}) {
    target.dispatchEvent(new CustomEvent(type, { detail }));
  },
};
