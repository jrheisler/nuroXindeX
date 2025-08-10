function tokenize(text = '') {
  return text.toLowerCase().match(/\w+/g) || [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = tokenize;
} else {
  window.tokenize = tokenize;
}
