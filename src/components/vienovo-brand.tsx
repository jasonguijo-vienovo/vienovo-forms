import type { SVGProps } from "react";

const COLORS = {
  teal: "#00A7C8",
  blue: "#005B7A",
  green: "#97C93C",
} as const;

export function VienovoMark(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 64 64"
      aria-label="Vienovo"
      role="img"
      className={className}
      {...rest}
    >
      <g transform="translate(32 32)">
        <path
          d="M0-29 C10-29 16-22 16-14 C16-8 12-4 6-2 C2-1 -1-2 -4-5 C-8-10 -9-19 0-29Z"
          fill={COLORS.blue}
          opacity="0.95"
          transform="rotate(0)"
        />
        <path
          d="M0-29 C10-29 16-22 16-14 C16-8 12-4 6-2 C2-1 -1-2 -4-5 C-8-10 -9-19 0-29Z"
          fill={COLORS.green}
          opacity="0.95"
          transform="rotate(120)"
        />
        <path
          d="M0-29 C10-29 16-22 16-14 C16-8 12-4 6-2 C2-1 -1-2 -4-5 C-8-10 -9-19 0-29Z"
          fill={COLORS.teal}
          opacity="0.95"
          transform="rotate(240)"
        />
      </g>
      <circle cx="32" cy="32" r="5.5" fill={COLORS.green} />
    </svg>
  );
}

