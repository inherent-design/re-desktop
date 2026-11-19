import Access from '../build/access.mjs';

export { Access };
export function list(xs) {
  const result = [];
  for (let node = xs; node.$ === 'Con'; node = node.tail) result.push(node.head);
  return result;
}
