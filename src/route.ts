import { type CustomElement, define, onDisconnect } from "./element.ts";
import { jsx } from "./jsx-runtime.ts";
import {
  $,
  adoptNode,
  body,
  call,
  dispatchPrevented,
  doc,
  domParse,
  eventType,
  forEach,
  head,
  listen,
  newURL,
  preventDefault,
  Promise,
  querySelectorAll,
  replaceWith,
  stopPropagation,
  TRUE,
  UNDEFINED,
  win,
} from "./util.ts";

const suspenseDelay = 500;

let rootSlot: CCRouteElement | undefined;
let unsubRoot: (() => void) | undefined = UNDEFINED;

let routeRequests: Record<string, Promise<Document | 0> | undefined> = {};
let currentNavigateQ: Promise<unknown>;

const findUnloaded = (
  destination: string,
  search: string,
): [string[], CCRouteElement] | undefined => {
  let unloadedSegments = [],
    curSlot: CCRouteElement | undefined = rootSlot,
    curPath: string | undefined,
    slot: CCRouteElement | undefined = UNDEFINED,
    part,
    url = "",
    matching: CCRouteElement | boolean | string | undefined = TRUE;

  for (part of destination.slice(1).split("/")) {
    url += "/" + part;
    matching &&= curSlot && part &&
      (part == (curPath = curSlot.path) || curPath == "*") &&
      curSlot[$slot];
    if (!matching) {
      slot ||= curSlot;
      if (part) unloadedSegments.push(url + "?cc-layout&");
    }
    curSlot = matching ? curSlot![$slot] : UNDEFINED;
  }

  slot ||= curSlot;
  unloadedSegments.push(
    (destination == "/" ? "" : destination) + "?cc-part&" + search.slice(1),
  );

  return slot && [unloadedSegments, slot];
};

const navigate = async (href: string) => {
  let { pathname, search } = newURL(href, location.origin),
    obsolete = findUnloaded(pathname, search);

  // Fallback to regular navigation if page defines no route
  if (!obsolete) return location.href = href;

  let [missingPartials, slot] = obsolete,
    curSlot: CCRouteElement | undefined = slot,
    resEls: Promise<Document | 0>[],
    el: Document | 0,
    navigateQ = currentNavigateQ = Promise.race([
      new Promise<void>((resolve) => setTimeout(resolve, suspenseDelay)),
      Promise.all(
        resEls = missingPartials
          .map((
            url,
            // deno-lint-ignore no-explicit-any
            q: any,
          ) =>
            routeRequests[url] ??= q = fetch(url)
              .then((res): 0 | Promise<Document | 0> =>
                res.redirected
                  ? Promise.reject(navigate(res.url))
                  : res.text().then((html) =>
                    q == routeRequests[url]
                      ? html ? domParse(html) : 0
                      : Promise.reject()
                  )
              )
              .finally(() => {
                delete routeRequests[url];
              })
          ),
      ),
    ]),
    raceRes = await navigateQ;

  if (!raceRes && curSlot) {
    replaceWith(
      curSlot,
      curSlot = jsx("cc-route", {
        children: jsx("progress"),
      }) as CCRouteElement,
    );
  }

  for await (el of resEls) {
    if (currentNavigateQ != navigateQ) return;
    if (el && !(curSlot = processHtmlRoute(el, curSlot!))) break;
  }

  if (location.href != href) history.pushState(0, "", href);
};

const processHtmlRoute = (receivedDoc: Document, slot: CCRouteElement) => {
  let title = receivedDoc.title,
    receivedBody = adoptNode(receivedDoc.body),
    children = [...receivedBody.children];

  if (title) doc.title = title;

  let newSegment = children[0] as CCRouteElement,
    newScripts = querySelectorAll<HTMLScriptElement>("script", receivedBody),
    currentHead: Record<string, Element> = {};

  forEachSourceable(doc.head, (el, key) => currentHead[key] = el);
  forEachSourceable(
    receivedDoc.head,
    (el, key) => !currentHead[key] && head.append(adoptNode(el)),
  );

  replaceWith(slot, ...children);

  // Scripts parsed with DOMParser are not marked to be run
  forEach(newScripts, reviveScript);

  return newSegment[$slot];
};

const forEachSourceable = (
  head: HTMLHeadElement,
  cb: (el: HTMLLinkElement | HTMLScriptElement, key: string) => void,
) =>
  forEach(
    querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
      `link,script`,
      head,
    ),
    (el, tagName?: any) =>
      cb(
        el,
        `${tagName = el.tagName}:${
          tagName == "LINK"
            ? (el as HTMLLinkElement).href
            : (el as HTMLScriptElement).src
        }`,
      ),
  );

const reviveScript = (script: HTMLScriptElement) => {
  let copy = doc.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
};

const isLocal = (href: string) => {
  let origin = location.origin;
  return newURL(href, origin).origin == origin;
};

const subRoot = () => {
  let t: EventTarget | null,
    subs: Array<() => void> = [
      listen(
        body,
        "click",
        (e) =>
          !e.ctrlKey &&
          !e.shiftKey &&
          (t = e.target) instanceof HTMLAnchorElement &&
          isLocal(t.href) && (preventDefault(e), navigate(t.href)),
      ),

      listen(
        body,
        "submit",
        (e) =>
          (t = e.target) instanceof HTMLFormElement &&
          t.method == "get" &&
          !e.defaultPrevented &&
          isLocal(t.action) && (preventDefault(e), navigate(t.action)),
      ),

      listen(body, SlotEvent, (e) => rootSlot = e.detail),

      listen(win, "popstate", () => navigate(location.href)),
    ];

  unsubRoot = () => {
    subs.map(call);
    routeRequests = {};
    unsubRoot = UNDEFINED;
  };
};

const SlotEvent = eventType<CCRouteElement | undefined>();

type CCRouteElement =
  & InstanceType<CCRouteElementClass>
  & { get [$slot](): CCRouteElement | undefined };

export type CCRouteElementClass = CustomElement<"cc-route", { path?: string }>;

const $slot: unique symbol = $() as never;

define("cc-route", {
  props: { path: String },
  js(dom) {
    let root = dom(jsx("slot"));
    let host = root.host;
    let slot: CCRouteElement | undefined = UNDEFINED;

    unsubRoot ?? subRoot();

    listen(host, SlotEvent, (e) => {
      if (e.target != host) {
        slot = e.detail;
        stopPropagation(e);
      }
    });

    dispatchPrevented(host, new SlotEvent(host));

    onDisconnect(root, () => dispatchPrevented(host, new SlotEvent()));

    return {
      get [$slot]() {
        return slot;
      },
    };
  },
}) satisfies CCRouteElementClass;
