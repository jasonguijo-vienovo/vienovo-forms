"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode } from "react";

type SmoothPageLinkProps = LinkProps & {
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  direction?: "next" | "previous";
  "aria-disabled"?: boolean;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
};

export function SmoothPageLink({
  href,
  className,
  children,
  disabled,
  direction,
  ...rest
}: SmoothPageLinkProps) {
  const router = useRouter();
  const nextHref = typeof href === "string" ? href : `${href.pathname ?? ""}${href.search ?? ""}${href.hash ?? ""}`;

  const prefetch = () => {
    if (disabled) return;
    router.prefetch(nextHref);
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const viewTransitionDoc = document as ViewTransitionDocument;
    const root = document.documentElement;
    if (direction) {
      root.dataset.navDirection = direction;
    } else {
      delete root.dataset.navDirection;
    }

    if (typeof viewTransitionDoc.startViewTransition === "function") {
      viewTransitionDoc
        .startViewTransition(() => router.push(nextHref, { scroll: false }))
        .finished.finally(() => {
          delete root.dataset.navDirection;
        });
      return;
    }

    router.push(nextHref, { scroll: false });
    delete root.dataset.navDirection;
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      className={className}
      {...rest}
    >
      {children}
    </Link>
  );
}
