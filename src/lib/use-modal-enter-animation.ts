"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

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
