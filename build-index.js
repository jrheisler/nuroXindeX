const fs = require('fs');
const path = require('path');
const tokenize = require('./js/core/tokenize');

const META_DIR = path.join(__dirname, 'meta');
const INDEX_FILE = path.join(__dirname, 'index.json');

function isValidDate(value) {
  return !isNaN(Date.parse(value));
}

function readMetadata() {
  if (!fs.existsSync(META_DIR)) {
    return [];
  }
  const files = fs.readdirSync(META_DIR).filter(f => f.endsWith('.json'));
  const items = [];
  for (const file of files) {
    const filePath = path.join(META_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      if (typeof data.title !== 'string' || typeof data.path !== 'string') {
        throw new Error('Missing required fields');
      }
      if (data.date && !isValidDate(data.date)) {
        throw new Error('Invalid date');
      }
      const textContent = Object.values(data)
        .filter(v => typeof v === 'string')
        .join(' ');
      data.tokens = Array.from(new Set(tokenize(textContent)));
      items.push(data);
    } catch (err) {
      console.error(`Skipping ${file}: ${err.message}`);
    }
  }
  return items;
}

function sortItems(items) {
  return items.sort((a, b) => {
    if (a.date && b.date && isValidDate(a.date) && isValidDate(b.date)) {
      return new Date(b.date) - new Date(a.date);
    }
    return a.title.localeCompare(b.title);
  });
}

function writeIndex(items) {
  const sorted = sortItems(items);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

const items = readMetadata();
writeIndex(items);
