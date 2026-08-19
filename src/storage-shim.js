// Falls back to localStorage when the app isn't running inside a host that
// already provides window.storage (e.g. a Claude artifact preview).
if (!window.storage) {
  window.storage = {
    async get(key, shared) {
      const v = localStorage.getItem((shared ? "shared:" : "user:") + key);
      if (v === null) throw new Error("not found");
      return { key, value: v, shared: !!shared };
    },
    async set(key, value, shared) {
      localStorage.setItem((shared ? "shared:" : "user:") + key, value);
      return { key, value, shared: !!shared };
    },
    async delete(key, shared) {
      localStorage.removeItem((shared ? "shared:" : "user:") + key);
      return { key, deleted: true, shared: !!shared };
    },
    async list(prefix, shared) {
      const pre = (shared ? "shared:" : "user:") + (prefix || "");
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith(pre))
        .map((k) => k.slice((shared ? "shared:" : "user:").length));
      return { keys, prefix, shared: !!shared };
    },
  };
}
