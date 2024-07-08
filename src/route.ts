import { type CustomElement, define, onDisconnect } from "./element.ts";
import { jsx } from "./jsx-runtime.ts";
import {
  adoptNode,
  call,
  doc,
  domParse,
  forEach,
  head,
  newURL,
  preventDefault,
  Promise,
  querySelectorAll,
  replaceWith,
  startsWith,
  subEvent,
  win,
} from "./util.ts";

const suspenseDelay = 500;

type Segment = { p: string; s?: ChildNode };
const segments = new Map<EventTarget, Segment>();
let unsubRoot: () => void = null!;

let routeRequests: Record<string, Promise<Document> | undefined> = {};
let currentNavigateQ: Promise<unknown>;

const findObsolete = (
  destination: string,
  parent: ChildNode = doc.body,
  segment: Segment = segments.get(parent)!,
): [string[], ChildNode] | null | undefined => {
  let slot = segment?.s,
    subSegment = slot && segments.get(slot),
    subPath = (subSegment ?? segment).p;
  return slot
    ? subSegment && startsWith(destination, subPath)
      // Slot is part of destination: find inside
      ? findObsolete(destination, slot, subSegment)
      : startsWith(subPath, destination)
      // Only index needed
      ? [[destination], slot]
      // Subpaths starting from segment
      : [
        destination
          .slice(segment.p.length)
          .split("/")
          .map((_, i, arr) => segment.p + arr.slice(0, i + 1).join("/")),
        slot,
      ]
    : parent
    ? [[destination], parent] // No layout to replace; parent is the page to replace
    : slot;
};

const isLocal = (href: string) => {
  let origin = location.origin;
  return newURL(href, origin).origin == origin;
};

const navigate = async (href: string) => {
  let { pathname, search } = newURL(href, location.origin),
    obsolete = findObsolete(pathname);

  // Fallback to regular navigation if page defines no route
  if (!obsolete) return location.replace(href);

  let [missingPartials, slot] = obsolete,
    curSlot = slot as ChildNode | null | undefined,
    resEls: Promise<Document>[],
    el: Document,
    url: string,
    navigateQ = currentNavigateQ = Promise.race([
      new Promise<void>((resolve) => setTimeout(resolve, suspenseDelay)),
      Promise.all(
        resEls = missingPartials.map((
          path,
          i,
          // deno-lint-ignore no-explicit-any
          q: any,
        ) => (
          url = (path == "/" ? "" : path) +
            (i == missingPartials.length - 1 ? "/.part" + search : "/.layout"),
            routeRequests[url] ??= q = fetch(url)
              .then((res) =>
                res.redirected ? Promise.reject(navigate(res.url)) : res.text()
              )
              .then((html) =>
                q == routeRequests[url] ? domParse(html) : Promise.reject()
              )
              .finally(() => {
                delete routeRequests[url];
              })
        )),
      ),
    ]),
    raceRes = await navigateQ;

  if (!raceRes && curSlot) {
    replaceWith(curSlot, curSlot = jsx("progress"));
  }

  for await (el of resEls) {
    if (currentNavigateQ != navigateQ) return;
    if (!(curSlot = processHtmlRoute(el, curSlot!))) break;
  }

  if (location.href != href) history.pushState(0, "", href);
};

const processHtmlRoute = (receivedDoc: Document, slot: ChildNode) => {
  let fragment = new DocumentFragment();
  fragment.append(...adoptNode(receivedDoc.body).children);

  if (receivedDoc.title) doc.title = receivedDoc.title;

  let tagName: string,
    forEachSourceable = (
      head: HTMLHeadElement,
      cb: (el: HTMLLinkElement | HTMLScriptElement, key: string) => void,
    ) =>
      forEach(
        querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
          `link,script`,
          head,
        ),
        (el) =>
          cb(
            el,
            `${tagName = el.tagName}:${
              tagName == "LINK"
                ? (el as HTMLLinkElement).href
                : (el as HTMLScriptElement).src
            }`,
          ),
      ),
    currentHead: Record<string, Element> = {};

  forEachSourceable(doc.head, (el, key) => currentHead[key] = el);
  forEachSourceable(
    receivedDoc.head,
    (el, key) => !currentHead[key] && head.append(adoptNode(el)),
  );

  replaceWith(slot, fragment);

  // Scripts parsed with DOMParser are not marked to be run
  forEach(
    querySelectorAll<HTMLScriptElement>("script", fragment),
    reviveScript,
  );

  return segments.get(fragment.children[0])?.s;
};

const reviveScript = (script: HTMLScriptElement) => {
  let copy = doc.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
};

const subRoot = () => {
  let t: EventTarget | null,
    body = doc.body,
    subs: Array<() => void> = [
      subEvent(
        body,
        "click",
        (e) =>
          !e.ctrlKey &&
          !e.shiftKey &&
          (t = e.target) instanceof HTMLAnchorElement &&
          (isLocal(t.href) ? navigate(t.href) : preventDefault(e)),
      ),

      subEvent(
        body,
        "submit",
        (e) =>
          (t = e.target) instanceof HTMLFormElement &&
          t.method == "get" &&
          !e.defaultPrevented &&
          (isLocal(t.action) ? navigate(t.action) : preventDefault(e)),
      ),

      subEvent(win, "popstate", () => navigate(location.href)),
    ];

  segments.set(body, { p: "/" });

  unsubRoot = () => {
    segments.delete(body);
    subs.map(call);
    routeRequests = {};
  };
};

export type RouteType = CustomElement<
  "cc-route",
  HTMLElement,
  { path?: string }
>;

define("cc-route", {
  props: { path: String },
  js(dom, props) {
    const path = props.path();
    const root = dom(jsx("slot"));
    const host = root.host;

    if (!unsubRoot) subRoot();

    if (path) segments.set(host, { p: path });

    // Notify closest parent that this target is the slot
    let parent: Node | null = host,
      parentSegment: Segment | null | undefined;
    do {
      parent = parent.parentNode;
      parentSegment = parent && segments.get(parent);
    } while (parent && !parentSegment);
    if (parentSegment) parentSegment.s = host;

    onDisconnect(root, () => {
      if (path != null) segments.delete(host);
      if (segments.size > 1 && parent) delete segments.get(parent)!.s;
    });
  },
}) satisfies RouteType;
