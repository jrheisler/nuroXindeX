const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Minimal DOM stub
function createElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    querySelectorAll() { return []; }
  };
}

const codeEl = { tagName: 'CODE', style: {}, querySelectorAll() { return []; } };

const documentStub = {
  body: { style: {}, querySelectorAll: () => [codeEl] },
  createElement,
  documentElement: { style: { setProperty() {} } },
  querySelectorAll: () => [codeEl]
};

// Load Stream class
const streamCode = fs.readFileSync(path.join(__dirname, 'stream.js'), 'utf8');
const Stream = new Function(`${streamCode}; return Stream;`)();

// Load theme module
const themeCode = fs.readFileSync(path.join(__dirname, 'theme.js'), 'utf8');
const { themes, currentTheme, applyTheme } = new Function('Stream', 'document', `${themeCode}; return { themes, currentTheme, applyTheme };`)(Stream, documentStub);

// Apply theme to an element to initialize styles
const el = documentStub.createElement('div');
applyTheme(el);

// Initial theme should set base and monospace fonts
assert.strictEqual(documentStub.body.style.fontFamily, themes.dark.fonts.base);
assert.strictEqual(codeEl.style.fontFamily, themes.dark.fonts.monospace);

// Switch theme and verify fonts update
currentTheme.set(themes.light);
assert.strictEqual(documentStub.body.style.fontFamily, themes.light.fonts.base);
assert.strictEqual(codeEl.style.fontFamily, themes.light.fonts.monospace);

console.log('Theme font switching works');
