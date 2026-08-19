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
export function useModalEnterAnimation() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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
