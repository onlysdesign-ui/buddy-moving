class QuickLRU extends Map {
  constructor(options = {}) {
    const { maxSize, onEviction } = options;
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new TypeError('maxSize must be a positive integer');
    }

    super();

    this.maxSize = maxSize;
    this.onEviction = typeof onEviction === 'function' ? onEviction : null;
  }

  get(key) {
    if (!super.has(key)) {
      return undefined;
    }

    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }

  peek(key) {
    return super.get(key);
  }

  set(key, value) {
    if (super.has(key)) {
      super.delete(key);
    }

    super.set(key, value);

    if (this.size > this.maxSize) {
      const [firstKey, firstValue] = this.entries().next().value;
      super.delete(firstKey);
      if (this.onEviction) {
        this.onEviction(firstKey, firstValue);
      }
    }

    return this;
  }
}

module.exports = QuickLRU;
module.exports.default = QuickLRU;
