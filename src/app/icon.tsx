import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#0b3a4d 0%,#0a6f87 40%,#0b3a4d 100%)",
          borderRadius: 14,
        }}
      >
        <svg width="48" height="48" viewBox="0 0 64 64">
          <g transform="translate(32 32)">
            <path
              d="M0-29 C10-29 16-22 16-14 C16-8 12-4 6-2 C2-1 -1-2 -4-5 C-8-10 -9-19 0-29Z"
              fill="#005B7A"
              opacity="0.95"
              transform="rotate(0)"
            />
            <path
              d="M0-29 C10-29 16-22 16-14 C16-8 12-4 6-2 C2-1 -1-2 -4-5 C-8-10 -9-19 0-29Z"
              fill="#97C93C"
              opacity="0.95"
              transform="rotate(120)"
            />
            <path
              d="M0-29 C10-29 16-22 16-14 C16-8 12-4 6-2 C2-1 -1-2 -4-5 C-8-10 -9-19 0-29Z"
              fill="#00A7C8"
              opacity="0.95"
              transform="rotate(240)"
            />
          </g>
          <circle cx="32" cy="32" r="5.5" fill="#97C93C" />
        </svg>
      </div>
    ),
    size
  );
}

