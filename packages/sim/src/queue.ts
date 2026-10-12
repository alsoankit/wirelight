/**
 * The event queue as a binary min-heap on (t, seq), stored in a plain array so it snapshots as JSON
 * (SIM-39). `seq` breaks ties in insertion order, so equal times always run in the same order
 * (SIM-02). A heap keeps storms cheap: thousands of frames in flight cost log n per event, not n.
 */

type Item = { t: number; seq: number };

function before(a: Item, b: Item): boolean {
  return a.t < b.t || (a.t === b.t && a.seq < b.seq);
}

export function heapPush<T extends Item>(heap: T[], item: T): void {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(heap[i] as T, heap[parent] as T)) break;
    [heap[i], heap[parent]] = [heap[parent] as T, heap[i] as T];
    i = parent;
  }
}

export function heapPop<T extends Item>(heap: T[]): T | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || last === undefined) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let smallest = i;
    if (l < heap.length && before(heap[l] as T, heap[smallest] as T)) smallest = l;
    if (r < heap.length && before(heap[r] as T, heap[smallest] as T)) smallest = r;
    if (smallest === i) break;
    [heap[i], heap[smallest]] = [heap[smallest] as T, heap[i] as T];
    i = smallest;
  }
  return top;
}

/** Rebuilds heap order after items were edited in bulk (e.g. removed). */
export function heapify<T extends Item>(items: T[]): T[] {
  const heap: T[] = [];
  for (const item of items) heapPush(heap, item);
  return heap;
}
