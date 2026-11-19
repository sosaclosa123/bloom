// A note text box that supports highlighted words.
// Text is stored as plain text; highlighted words are wrapped as ==word==.
// With the "brush" on, clicking a word toggles its highlight (bold + marker).
import { useEffect, useRef } from 'react';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function noteToHTML(text: string): string {
  return esc(text).replace(/==([^=\n]+?)==/g, '<mark>$1</mark>');
}

/** Plain text without highlight markers (for search, previews). */
export const stripMarks = (text: string) => text.replace(/==([^=\n]+?)==/g, '$1');

function serialize(el: HTMLElement): string {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? '';
    else if (n.nodeName === 'MARK') {
      const t = n.textContent ?? '';
      out += t.trim() ? `==${t}==` : t;
    } else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeName === 'DIV' || n.nodeName === 'P') out += (out && !out.endsWith('\n') ? '\n' : '') + serialize(n as HTMLElement);
    else out += n.textContent ?? '';
  });
  return out;
}

const WORD = /[\p{L}\p{N}'’״׳-]/u;

/** Toggles the highlight on the word under the pointer. Returns true if something changed. */
function toggleWordAt(root: HTMLElement, x: number, y: number): boolean {
  const range = document.caretRangeFromPoint?.(x, y);
  if (!range || !root.contains(range.startContainer)) return false;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent ?? '';
  const parent = node.parentElement;
  // Already highlighted: remove the highlight.
  if (parent && parent.nodeName === 'MARK' && root.contains(parent)) {
    parent.replaceWith(document.createTextNode(parent.textContent ?? ''));
    root.normalize();
    return true;
  }
  let a = range.startOffset;
  let b = range.startOffset;
  while (a > 0 && WORD.test(text[a - 1])) a--;
  while (b < text.length && WORD.test(text[b])) b++;
  if (a === b) return false;
  const r = document.createRange();
  r.setStart(node, a);
  r.setEnd(node, b);
  const mark = document.createElement('mark');
  r.surroundContents(mark);
  return true;
}

interface Props {
  value: string;
  onSave: (v: string) => void;
  brush?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function NoteRich({ value, onSave, brush, placeholder, autoFocus, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  const timer = useRef<number | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // Render the stored text; skip while the person is typing in it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el && value === last.current) return;
    if (serialize(el) !== value) el.innerHTML = noteToHTML(value);
    last.current = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        const el = ref.current;
        if (el) {
          const v = serialize(el);
          if (v !== last.current) saveRef.current(v);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const el = ref.current;
    if (!el) return;
    const v = serialize(el);
    if (v !== last.current) {
      last.current = v;
      saveRef.current(v);
    }
  };

  return (
    <div
      ref={ref}
      className={`note-rich ${brush ? 'brush-on' : ''} ${className ?? ''}`}
      contentEditable={brush ? false : 'plaintext-only'}
      suppressContentEditableWarning
      dir="auto"
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder}
      onInput={() => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 450);
      }}
      onBlur={flush}
      onClick={(e) => {
        if (!brush || !ref.current) return;
        if (toggleWordAt(ref.current, e.clientX, e.clientY)) flush();
      }}
    />
  );
}
