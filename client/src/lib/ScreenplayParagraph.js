import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import {
  DEFAULT_ELEMENT,
  ELEMENTS,
  cycleElement,
  detectElement,
  elementOf,
  knownCharacters,
} from './screenplay.js';

/**
 * The screenplay block.
 *
 * Deliberately named "paragraph" so it replaces the stock node rather than
 * sitting beside it: documents written before this existed still load, and
 * their paragraphs simply become Action.
 *
 * One node type carrying an `element` attribute — rather than seven node
 * types — keeps the schema small, which matters because every attribute
 * change has to survive the CRDT merge like any other edit.
 */
export const ScreenplayParagraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  priority: 1100,

  addAttributes() {
    return {
      element: {
        default: DEFAULT_ELEMENT,
        parseHTML: (el) => el.getAttribute('data-element') || DEFAULT_ELEMENT,
        renderHTML: (attrs) => ({ 'data-element': attrs.element || DEFAULT_ELEMENT }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'p' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const element = elementOf(node);
    return [
      'p',
      mergeAttributes(HTMLAttributes, { class: `sp sp-${element}` }),
      0,
    ];
  },

  addCommands() {
    return {
      setScreenplayElement:
        (element) =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          const node = $from.parent;
          if (node.type.name !== 'paragraph') return false;
          if (dispatch) {
            applyElement(tr, $from.before($from.depth), node, element);
            dispatch(tr);
          }
          return true;
        },

      cycleScreenplayElement:
        (direction = 1) =>
        ({ state, commands }) => {
          const current = elementOf(state.selection.$from.parent);
          return commands.setScreenplayElement(cycleElement(current, direction));
        },
    };
  },

  addKeyboardShortcuts() {
    const direct = {};
    for (const [element, config] of Object.entries(ELEMENTS)) {
      direct[`Mod-${config.key}`] = () => this.editor.commands.setScreenplayElement(element);
    }

    return {
      ...direct,

      Enter: () => handleEnter(this.editor),
      Tab: () => this.editor.commands.cycleScreenplayElement(1),
      'Shift-Tab': () => this.editor.commands.cycleScreenplayElement(-1),

      // Backspace at the very start of a styled block returns it to Action
      // before it starts eating the previous block.
      Backspace: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const current = elementOf($from.parent);
        if (current === DEFAULT_ELEMENT) return false;
        return this.editor.commands.setScreenplayElement(DEFAULT_ELEMENT);
      },
    };
  },

  addProseMirrorPlugins() {
    return [autoCasePlugin()];
  },
});

// --------------------------------------------------------------- behaviour

/**
 * Uppercase the text already in a block, preserving any marks on it.
 *
 * CSS text-transform would only change how the line is painted; the
 * characters underneath would stay as typed and leave the editor wrong.
 * Replacements are the same length, so positions do not shift.
 */
function uppercaseBlock(tr, pos, node) {
  node.descendants((child, offset) => {
    if (!child.isText || !child.text) return;
    const upper = child.text.toUpperCase();
    if (upper === child.text) return;
    const from = pos + 1 + offset;
    tr.replaceWith(from, from + child.text.length, node.type.schema.text(upper, child.marks));
  });
}

/** Set a block's element, applying that element's casing to what is there. */
function applyElement(tr, pos, node, element) {
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, element });
  if (ELEMENTS[element]?.uppercase) uppercaseBlock(tr, pos, node);
}

function handleEnter(editor) {
  const { state, view } = editor;
  const { $from, empty } = state.selection;

  if (!empty) return false;
  if ($from.parent.type.name !== 'paragraph') return false;

  const node = $from.parent;
  const current = elementOf(node);
  const text = node.textContent;
  const blockStart = $from.before($from.depth);

  // Enter on an empty, non-Action block means "never mind" — drop back to
  // Action in place rather than leaving an empty cue behind.
  if (!text.trim() && current !== DEFAULT_ELEMENT) {
    return editor.commands.setScreenplayElement(DEFAULT_ELEMENT);
  }

  const detected = detectElement(text, current, knownCharacters(state.doc)) || current;
  const tr = state.tr;

  if (detected !== current) {
    applyElement(tr, blockStart, node, detected);
  }

  // Splitting mid-line keeps both halves as they are; only a split at the
  // end starts the next element in the sequence.
  const atEnd = $from.parentOffset === node.content.size;
  const nextElement = atEnd ? ELEMENTS[detected].next : detected;

  tr.split($from.pos, 1, [{ type: node.type, attrs: { ...node.attrs, element: nextElement } }]);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Scene headings, character cues, transitions and shots are uppercase in
 * every house style, so type them that way rather than faking it with CSS:
 * the text has to be correct when it leaves here.
 */
function autoCasePlugin() {
  return new Plugin({
    key: new PluginKey('screenplayAutoCase'),
    props: {
      handleTextInput(view, from, to, text) {
        const { $from } = view.state.selection;
        const node = $from.parent;
        if (node.type.name !== 'paragraph') return false;

        const element = elementOf(node);

        // Typing "(" on a fresh line under a cue means a parenthetical.
        if (text === '(' && node.content.size === 0 && (element === 'dialogue' || element === 'character')) {
          const tr = view.state.tr;
          tr.setNodeMarkup($from.before($from.depth), undefined, {
            ...node.attrs,
            element: 'paren',
          });
          tr.insertText('()', from, to);
          tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
          view.dispatch(tr);
          return true;
        }

        if (!ELEMENTS[element]?.uppercase) return false;
        const upper = text.toUpperCase();
        if (upper === text) return false;

        view.dispatch(view.state.tr.insertText(upper, from, to));
        return true;
      },
    },
  });
}
