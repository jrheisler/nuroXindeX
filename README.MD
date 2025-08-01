Here’s a complete `README.md` draft for your **jazira-js** framework, summarizing the architecture and recent JSON-bound `Stream` enhancements:

---

# 🌀 jazira-js

A lightweight reactive UI micro-framework in plain JavaScript — inspired by Svelte and Elm — with zero build tools, zero dependencies, and full runtime reactivity using `Stream` objects and declarative layout primitives.

---

## ✨ Features

* 🔁 **Stream-based reactivity**: Simple `Stream` objects keep your DOM in sync with app state.
* 🎨 **Theming system**: `currentTheme` and `themes` support dynamic light/dark themes with live CSS updates.
* 🧱 **Declarative layout**: Compose UI with `column`, `grid`, `container`, `spacer`, and `divider`.
* 📝 **Reactive components**: Use `reactiveText` and `editText` to bind UI to state.
* 🧩 **JSON-bound streams**: Bind `Stream` instances directly to keys in a JSON object (e.g. fetched from storage or API).

---

## 🧪 Example Usage

### Reactive Text Input

```js
const title = new Stream("Welcome");

document.body.appendChild(
  column([
    reactiveText(title, { size: "2rem" }),
    editText(title, { placeholder: "Edit title..." })
  ])
);
```

### Bind Stream to JSON Key

```js
const json = await fetch("data.json").then(r => r.json());

const name = new Stream({ json, key: "name" });

document.body.appendChild(
  column([
    reactiveText(name),
    editText(name)
  ])
);

// Updates to the Stream will sync back to the JSON object
name.set("Updated Name");
console.log(json.name); // "Updated Name"
```

---

## 🔧 API Reference

### `Stream(initialValue | { json, key })`

Reactive state container.

* `new Stream('Hello')`: plain value.
* `new Stream({ json, key: 'name' })`: binds to a value in an existing JSON object.

Methods:

* `stream.subscribe(fn)` – call `fn(value)` now and on future changes
* `stream.set(value)` – update value and notify subscribers
* `stream.get()` – get current value

---

### Layout Helpers

* `column(children, opts)`
* `container(children, opts)`
* `grid(children, opts)`
* `spacer({ height })`
* `divider()`

All return DOM elements and can be appended directly.

---

### Components

* `reactiveText(stream, opts?)`
* `editText(stream, opts?)`

---

### Theming

```js
import { currentTheme, themes, applyThemeToPage } from './core/theme.js';

currentTheme.set('dark'); // Switch to dark theme
applyThemeToPage(currentTheme.get());
```

---

## 📁 Project Structure

```
jazira-js/
├── index.html
├── css/theme.css
├── js/
│   ├── app.js
│   ├── core/
│   │   ├── stream.js
│   │   ├── theme.js
│   │   └── themes.js
│   └── components/
│       ├── elements.js
│       └── layout.js
```

---

## 🛠 Future Ideas

* [ ] Add `reactiveImage`, `toggleSwitch`, and `listView`
* [ ] Add `hydrate(json)` and `toJSON(domNode)` for layout persistence
* [ ] Optional drag-and-drop UI builder
* [ ] Optional export as ES module / NPM package

---

## 🧑‍💻 Author

Created by Jeff Heisler
[ScriptMemorizer.com](https://scriptmemorizer.com)

---

Would you like this as a downloadable file, or should I help auto-generate a live demo with these examples?
