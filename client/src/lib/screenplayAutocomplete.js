import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  SCENE_PREFIXES,
  TIME_OF_DAY,
  TRANSITIONS,
  elementOf,
} from './screenplay.js';

/**
 * Inline suggestions for the things a writer retypes constantly: character
 * names, locations they have already established, times of day and the
 * standard transitions.
 *
 * Built as a plain ProseMirror plugin with its own DOM rather than a React
 * component, so the dropdown and the keys that drive it live in one place
 * and never race the editor for Enter or Tab.
 */

const key = new PluginKey('screenplayAutocomplete');
const MAX_ITEMS = 6;

/** Everything the writer has already used, gathered from the document. */
function harvest(doc) {
  const characters = new Set();
  const scenes = new Set();

  doc.descendants((node) => {
    if (!node.isTextblock) return;
    const text = node.textContent.trim();
    if (!text) return;

    const element = elementOf(node);
    if (element === 'character') {
      // Store the bare name, without "(V.O.)" and friends.
      const name = text.replace(/\([^)]*\)\s*$/, '').trim();
      if (name) characters.add(name);
    } else if (element === 'scene') {
      scenes.add(text);
    }
  });

  return { characters: [...characters], scenes: [...scenes] };
}

function startsWith(candidate, query) {
  return candidate.toUpperCase().startsWith(query.toUpperCase());
}

/** What should be offered for the block the caret is in? */
function suggestionsFor(state) {
  const { $from, empty } = state.selection;
  if (!empty) return null;

  const node = $from.parent;
  if (node.type.name !== 'paragraph') return null;

  const element = elementOf(node);
  const text = node.textContent;
  const beforeCaret = text.slice(0, $from.parentOffset);

  // Only suggest while typing at the end of the line.
  if ($from.parentOffset !== text.length) return null;

  const { characters, scenes } = harvest(state.doc);

  if (element === 'character') {
    const query = beforeCaret.trim();
    if (!query) return null;
    const items = characters
      .filter((name) => startsWith(name, query) && name.toUpperCase() !== query.toUpperCase())
      .slice(0, MAX_ITEMS);
    return items.length ? { items, replace: 'line' } : null;
  }

  if (element === 'transition') {
    const query = beforeCaret.trim();
    if (!query) return null;
    const items = TRANSITIONS.filter(
      (t) => startsWith(t, query) && t.toUpperCase() !== query.toUpperCase()
    ).slice(0, MAX_ITEMS);
    return items.length ? { items, replace: 'line' } : null;
  }

  if (element === 'scene') {
    // After a dash, the writer is choosing a time of day.
    const dash = beforeCaret.match(/[-–]\s*([A-Z ]*)$/i);
    if (dash) {
      const query = dash[1].trim();
      const items = TIME_OF_DAY.filter(
        (t) => startsWith(t, query) && t.toUpperCase() !== query.toUpperCase()
      ).slice(0, MAX_ITEMS);
      return items.length ? { items, replace: 'tail', tailLength: dash[1].length } : null;
    }

    const query = beforeCaret.trim();
    if (!query) {
      return { items: SCENE_PREFIXES, replace: 'line' };
    }

    // Offer whole headings already in the script, then bare prefixes.
    const used = scenes.filter(
      (s) => startsWith(s, query) && s.toUpperCase() !== query.toUpperCase()
    );
    const prefixes = SCENE_PREFIXES.filter(
      (p) => startsWith(p, query) && p.trim().toUpperCase() !== query.toUpperCase()
    );
    const items = [...used, ...prefixes].slice(0, MAX_ITEMS);
    return items.length ? { items, replace: 'line' } : null;
  }

  return null;
}

function applySuggestion(view, suggestion, item) {
  const { state } = view;
  const { $from } = state.selection;
  const node = $from.parent;
  const blockStart = $from.start($from.depth);

  const from =
    suggestion.replace === 'tail' ? $from.pos - suggestion.tailLength : blockStart;
  const to = blockStart + node.content.size;

  const tr = state.tr.insertText(item, from, to);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export const ScreenplayAutocomplete = Extension.create({
  name: 'screenplayAutocomplete',
  // Ahead of the block's own Enter/Tab handling, so a highlighted
  // suggestion wins those keys while the list is open.
  priority: 1200,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,

        state: {
          init: () => ({ open: false, index: 0, suggestion: null }),
          apply(tr, value) {
            const meta = tr.getMeta(key);
            if (meta) return { ...value, ...meta };
            // Any document or selection change recomputes on view update.
            return value;
          },
        },

        props: {
          handleKeyDown(view, event) {
            const current = key.getState(view.state);
            if (!current?.open || !current.suggestion) return false;

            const { items } = current.suggestion;

            if (event.key === 'ArrowDown') {
              view.dispatch(
                view.state.tr.setMeta(key, { index: (current.index + 1) % items.length })
              );
              return true;
            }
            if (event.key === 'ArrowUp') {
              view.dispatch(
                view.state.tr.setMeta(key, {
                  index: (current.index - 1 + items.length) % items.length,
                })
              );
              return true;
            }
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(key, { open: false }));
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              const item = items[current.index];
              view.dispatch(view.state.tr.setMeta(key, { open: false }));
              applySuggestion(view, current.suggestion, item);
              return true;
            }
            return false;
          },
        },

        view(editorView) {
          const dropdown = document.createElement('div');
          dropdown.className = 'sp-autocomplete';
          dropdown.setAttribute('role', 'listbox');
          dropdown.style.display = 'none';
          document.body.appendChild(dropdown);

          const render = (view) => {
            const pluginState = key.getState(view.state);
            const suggestion = suggestionsFor(view.state);

            if (!suggestion || !view.hasFocus()) {
              dropdown.style.display = 'none';
              if (pluginState.open) {
                view.dispatch(view.state.tr.setMeta(key, { open: false, suggestion: null }));
              }
              return;
            }

            const sameItems =
              pluginState.suggestion &&
              pluginState.suggestion.items.join('\u0000') === suggestion.items.join('\u0000');

            if (!pluginState.open || !sameItems) {
              const index = sameItems ? pluginState.index : 0;
              view.dispatch(view.state.tr.setMeta(key, { open: true, suggestion, index }));
              return; // the dispatch re-enters render with fresh state
            }

            dropdown.innerHTML = '';
            suggestion.items.forEach((item, i) => {
              const row = document.createElement('div');
              row.className = i === pluginState.index ? 'sp-ac-item sp-ac-active' : 'sp-ac-item';
              row.setAttribute('role', 'option');
              row.setAttribute('aria-selected', String(i === pluginState.index));
              row.textContent = item;
              row.addEventListener('mousedown', (event) => {
                event.preventDefault();
                view.dispatch(view.state.tr.setMeta(key, { open: false }));
                applySuggestion(view, suggestion, item);
              });
              dropdown.appendChild(row);
            });

            const coords = view.coordsAtPos(view.state.selection.from);
            dropdown.style.display = 'block';
            dropdown.style.top = `${coords.bottom + 4}px`;
            dropdown.style.left = `${coords.left}px`;
          };

          render(editorView);

          return {
            update: (view) => render(view),
            destroy: () => dropdown.remove(),
          };
        },
      }),
    ];
  },
});
