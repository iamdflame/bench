"use client";

import { useEffect } from "react";

/**
 * The two motions that belong to data, and the rule that governs both.
 *
 * §9.6 allows exactly one orchestrated moment — the rail badge lighting when a
 * probe result refreshes — plus a digit roll when a value updates from chain.
 * It also forbids "counters that run on page load without a data event", and
 * those two sentences are in tension in a server-rendered product: the server
 * cannot know whether *this reader* has seen this reading before, so a naive
 * implementation blooms every badge on every load and becomes precisely the
 * decoration the rule bans.
 *
 * So freshness is measured against the reader, not against the clock. Each
 * live element carries the value it is showing and the moment it was read;
 * this remembers both in `sessionStorage` and animates only what changed since
 * the last page this person looked at. Reload a page nothing has changed on
 * and nothing moves. Come back after a worker cycle and only the rows that
 * actually moved light up.
 *
 * It is progressive enhancement in the strict sense: with JavaScript off the
 * badge still carries its colour, the number still carries its value, and
 * nothing on the read path depends on any of this.
 */

const KEY = "bench:seen:v1";

type Seen = Record<string, string>;

function readSeen(): Seen {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Seen;
  } catch {
    /* A private window, or storage the browser declined. Nothing animates. */
    return {};
  }
}

function writeSeen(seen: Seen) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* Storage refused. The interface is correct without it. */
  }
}

export default function Live() {
  useEffect(() => {
    /*
      Respect the setting before doing anything at all, rather than relying on
      the stylesheet to zero the durations afterwards. A class that is never
      added cannot be animated, which is a stronger guarantee than a duration
      that is set to nothing.
    */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const seen = readSeen();
    const next: Seen = { ...seen };
    let first = Object.keys(seen).length === 0;

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-live]"))) {
      const key = el.dataset.live;
      const value = el.dataset.liveValue ?? el.textContent ?? "";
      if (!key) continue;
      next[key] = value;

      /*
        The first visit of a session establishes a baseline and animates
        nothing. Blooming the whole board because somebody arrived is the
        page-load counter the plan forbids.
      */
      if (first) continue;
      if (seen[key] === undefined || seen[key] === value) continue;

      if (el.dataset.liveKind === "rail") el.setAttribute("data-fresh", "");
      else el.classList.add("rolled");
    }

    writeSeen(next);

    /*
      The animation classes are removed once they have played, so a later
      render of the same element does not replay them and the DOM does not
      accumulate state that means nothing.
    */
    const t = setTimeout(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-fresh]"))) {
        el.removeAttribute("data-fresh");
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(".rolled"))) {
        el.classList.remove("rolled");
      }
    }, 700);

    return () => clearTimeout(t);
  }, []);

  return null;
}
