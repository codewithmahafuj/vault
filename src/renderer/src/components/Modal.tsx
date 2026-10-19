import { useEffect, useId, useRef } from 'react';
import type { JSX, KeyboardEvent, MouseEvent, ReactNode } from 'react';

// One centered card in the shell every overlay in this app uses: a dark
// backdrop, a white container with --shadow-modal, and the keyboard behaviour a
// dialog is expected to have. Nothing here knows about credentials.

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
].join(',');

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)];
}

export interface ModalProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  // While an operation is in flight the card stays up and the escape routes are
  // withheld, so a user cannot discard the result they are waiting for.
  readonly dismissible: boolean;
}

export default function Modal({ title, children, onClose, dismissible }: ModalProps): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const pressedOnOverlay = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const card = cardRef.current;
    const previous = document.activeElement;
    if (card !== null) {
      // A card that opens while its fields are still locked has no autofocus
      // target it can actually take, and focus must not stay outside a modal.
      const first =
        card.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
        focusables(card)[0] ??
        card;
      first.focus();
    }
    return () => {
      // Hand focus back to whatever opened the card. It may no longer be in the
      // document, in which case the browser keeps focus on the body.
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      if (!dismissible) {
        return;
      }
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const card = cardRef.current;
    if (card === null) {
      return;
    }
    const targets = focusables(card);
    if (targets.length === 0) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    const index = targets.findIndex((element) => element === active);
    // The card itself holds focus before the first field is reached, and an
    // element outside the card can be active only after a trap has already been
    // broken; both cases restart at the ends of the list.
    const direction = event.shiftKey ? -1 : 1;
    const next =
      index === -1
        ? event.shiftKey
          ? targets[targets.length - 1]
          : targets[0]
        : targets[(index + direction + targets.length) % targets.length];
    event.preventDefault();
    if (next !== undefined) {
      next.focus();
    }
  }

  function onOverlayMouseDown(event: MouseEvent<HTMLDivElement>): void {
    pressedOnOverlay.current = event.target === event.currentTarget;
  }

  function onOverlayMouseUp(event: MouseEvent<HTMLDivElement>): void {
    const pressed = pressedOnOverlay.current;
    pressedOnOverlay.current = false;
    // Both the press and the release have to land on the backdrop: a text
    // selection that starts in a field and ends outside the card is not a
    // request to close it.
    if (dismissible && pressed && event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={onOverlayMouseDown}
      onMouseUp={onOverlayMouseUp}
      onKeyDown={onKeyDown}
    >
      <div
        ref={cardRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
        </header>
        {children}
      </div>
    </div>
  );
}
