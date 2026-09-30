const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function file(name) {
  return path.join(DATA_DIR, name + '.json');
}

function read(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (err) {
    return fallback;
  }
}

// Write to a temp file first, then rename, so a crash never leaves half a file.
function write(name, data) {
  const target = file(name);
  const tmp = target + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const products = {
  all: () => read('products'),
  bySlug: (slug) => read('products').find((p) => p.slug === slug),
  save: (list) => write('products', list)
};

const categories = {
  all: () => read('categories'),
  bySlug: (slug) => read('categories').find((c) => c.slug === slug)
};

function append(name, record) {
  const list = read(name);
  list.unshift(record);
  write(name, list);
  return record;
}

module.exports = { read, write, append, slugify, products, categories };
