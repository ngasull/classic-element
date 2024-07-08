// Const

const gbl = globalThis;

const Array = gbl.Array;
const DOMParser = gbl.DOMParser;
const JSON = gbl.JSON;
const Object = gbl.Object;

export const doc = gbl.document;
export const Promise = gbl.Promise;
export const $ = gbl.Symbol;
export const win = gbl.window;

export const head: HTMLHeadElement = doc?.head!;

export const textHtml = "text/html";

export const routeLoadEvent = "route-load";

// FP

export const call = <T>(cb: () => T): T => cb();

export const first = <T>(a: readonly [T, ...any[]]): T => a[0];

export const last = <T>(a: readonly T[]): T => a[length(a) - 1];

export const forEach = <
  T extends Record<"forEach", (...item: readonly any[]) => any>,
>(
  iterable: T | null | undefined,
  cb: T extends Record<"forEach", (cb: infer Cb) => void> ? Cb : never,
): void => iterable?.forEach(cb);

export const forOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  for (let i of iterable) cb(i);
};

export const reverseForOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  let arr = [...iterable], i = arr.length - 1;
  for (; i >= 0; i--) cb(arr[i]);
};

export const id = <T>(v: T): T => v;

export const isFunction = <T extends Function>(v: unknown): v is T =>
  typeof v == "function";

export const isString = (v: unknown): v is string => typeof v === "string";

export const length = (lengthy: { length: number }) => lengthy.length;

export const memo1 = <Fn extends (arg: any) => any>(
  fn: Fn,
): Fn & { del: (a: Parameters<Fn>[0]) => boolean } => {
  let cache = new WeakMap(),
    m = ((arg) => (
      !cache.has(arg) && cache.set(arg, fn(arg)), cache.get(arg)
    )) as Fn & { del: (a: Parameters<Fn>[0]) => boolean };
  m.del = (arg: Parameters<Fn>[0]) => cache.delete(arg);
  return m;
};

export const noop = (): void => {};

export const popR = <T>(arr: T[]): T[] => (arr.pop(), arr);

export const pushR = <T>(arr: T[], ...v: T[]): T[] => (arr.push(...v), arr);

export const startsWith = (str: string, start: string): boolean =>
  str.startsWith(start);

export const toLowerCase = (str: string): string => str.toLowerCase();

export const isArray = Array.isArray;

export const arraySlice = Array.prototype.slice;

export const parse = JSON.parse;

export const assign = Object.assign;
export const defineProperties = Object.defineProperties;
export const entries = Object.entries;
export const freeze = Object.freeze;
export const fromEntries = Object.fromEntries;
export const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
export const keys = Object.keys;
export const values = Object.values;

// DOM

const domParser = DOMParser && new DOMParser();

export const parseHtml = (html: string): Document =>
  domParser.parseFromString(html, textHtml);

export const adoptNode = <T extends Node>(node: T): T => doc.adoptNode(node);

export const cloneNode = <T extends Node>(node: T): T =>
  node.cloneNode(true) as T;

export const dataset = (el: HTMLElement | SVGElement): DOMStringMap =>
  el.dataset;

export const dispatchPrevented = (el: EventTarget, event: Event): boolean => (
  el.dispatchEvent(event), event.defaultPrevented
);

export const customEvent = <T>(
  type: string,
  detail?: T,
  opts?: CustomEventInit<T>,
): CustomEvent =>
  new CustomEvent(type, { bubbles: true, cancelable: true, detail, ...opts });

export const ifDef = <T, U>(v: T, cb: (v: NonNullable<T>) => U): T | U =>
  v == null ? (v as Exclude<T, NonNullable<T>>) : cb(v);

export const insertBefore = (
  parent: Node,
  node: Node,
  child: Node | null,
): Node => parent.insertBefore(node, child);

export const newURL = (
  url: string | URL,
  base?: string | URL | undefined,
): URL => new URL(url, base);

export const preventDefault = (e: Event): void => e.preventDefault();

export const querySelector = <E extends Element>(
  selector: string,
  node: ParentNode = doc.body,
): E | null => node.querySelector<E>(selector);

export const querySelectorAll = <E extends Element>(
  selector: string,
  node: ParentNode = doc.body,
): NodeListOf<E> => node.querySelectorAll<E>(selector);

export const remove = (el: ChildNode): void => el.remove();

export const replaceWith = (
  el: ChildNode,
  ...node: readonly (Node | string)[]
): void => el.replaceWith(...node);

type ListenerOfAddEvent<K extends string, T extends EventTarget> = (
  this: T,
  e: T extends Window ? K extends keyof WindowEventMap ? WindowEventMap[K]
    : Event
    : K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K]
    : Event,
) => void;

export const stopPropagation = (e: Event): void => e.stopPropagation();

export const subEvent = <
  K extends string,
  T extends EventTarget,
>(
  target: T,
  type: K,
  listener: ListenerOfAddEvent<K, T>,
  stopPropag?: 1 | 0 | boolean,
): () => void => {
  let wrappedListener = (stopPropag
    ? (function (e) {
      stopPropagation(e);
      listener.call(this, e);
    } as typeof listener)
    : listener) as EventListener;
  target.addEventListener(type, wrappedListener);
  return () => target.removeEventListener(type, wrappedListener);
};

type Deep<T> = T | readonly Deep<T>[];

export const deepMap = <T, R>(v: Deep<T>, cb: (v: T) => R): R[] =>
  isArray(v) ? deepMap_(v, cb) as R[] : [cb(v as T)];

const deepMap_ = <T, R>(v: Deep<T>, cb: (v: T) => R): R | R[] =>
  isArray(v) ? v.flatMap((v) => deepMap_(v, cb)) : cb(v as T);

const camelRegExp = /[A-Z]/g;

export const hyphenize = (camel: string): string =>
  camel.replace(
    camelRegExp,
    (l: string) => "-" + l.toLowerCase(),
  );
