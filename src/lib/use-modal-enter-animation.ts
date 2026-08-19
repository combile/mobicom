"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Closes a modal on Escape.
 *
 * Listens on the document because focus may sit anywhere inside the modal —
 * or nowhere in particular right after it opens — so a handler bound to the
 * card would miss the key.
 *
 * `onClose` is read through a ref so a handler redefined on every render does
 * not detach and rebind the listener each time.
 */
export function useCloseOnEscape(onClose: () => void) {
  const handler = useRef(onClose);
  handler.current = onClose;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handler.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * Entrance animation shared by every create modal.
 *
 * Attach `overlayRef` to the overlay and `cardRef` to the card. The hook must
 * live in a component that mounts when the modal opens — calling it from a
 * parent that stays mounted means the animation only ever runs once, on page
 * load, while the modal is still hidden.
 *
 * Exit animation is deliberately absent: it would need extra state to delay
 * unmounting past the tween.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside the modal and puts focus in it on open.
 *
 * Without this, Tab walks straight out of the modal and into the page behind
 * it — which is still there, just visually covered — so a keyboard user ends
 * up editing a form they cannot see.
 *
 * Focus lands on the first field rather than the card itself, so typing works
 * immediately; if the modal has no focusable content, the card takes focus so
 * the Escape handler still has somewhere sensible to be.
 *
 * Focus returns to whatever was focused before on close, so dismissing a modal
 * does not dump the user back at the top of the page.
 */
export function useModalFocus(cardRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const previous = document.activeElement as HTMLElement | null;
    // a div is not focusable on its own, and the card needs to be for the
    // no-fields fallback below
    if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
    const first = card.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? card).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !card) return;
      // re-queried per keypress: fields appear and disappear as the form
      // changes, so a list captured on mount would go stale
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    card.addEventListener("keydown", onKeyDown);
    return () => {
      card.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [cardRef]);
}

export function useModalEnterAnimation() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // every modal already calls this hook, so trapping focus here covers all of
  // them without touching a single call site
  useModalFocus(cardRef);

  useGSAP(() => {
    if (overlayRef.current) {
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.15, ease: "power1.out" },
      );
    }
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, scale: 0.96, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: "power2.out" },
      );
    }
  }, []);

  return { overlayRef, cardRef };
}
