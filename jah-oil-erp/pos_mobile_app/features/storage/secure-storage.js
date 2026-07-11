function canUseWebStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

const secureStorage = {
  async getItem(key) {
    if (!canUseWebStorage()) {
      return null;
    }

    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (!canUseWebStorage()) {
      return;
    }

    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (!canUseWebStorage()) {
      return;
    }

    window.localStorage.removeItem(key);
  },
};

export default secureStorage;
