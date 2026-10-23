const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
export const graphemes = text => Array.from(segmenter.segment(text), item => item.segment);
export const count = text => graphemes(text).length;
export const limit = (text, max = 30) => graphemes(text).slice(0, max).join('');
export function validateComment(value) {
  if (typeof value !== 'string') throw new Error('コメントを入力してください。');
  // Bidi formatting and invisible controls cannot alter other comments' rendering.
  if (/[\r\n\u2028\u2029\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error('改行や制御文字は使えません。');
  const text = value.trim();
  if (!text || !/[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/u.test(text)) throw new Error('コメントを入力してください。');
  if (count(text) > 30) throw new Error('コメントは30文字以内です。');
  // A single grapheme may contain an unbounded number of combining marks.
  if (new TextEncoder().encode(text).length > 2048) throw new Error('文字データが大きすぎます。');
  return text;
}
