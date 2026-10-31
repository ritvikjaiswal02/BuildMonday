"use client";

import * as React from "react";
import { cn, initials } from "@/lib/utils";

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string;
  size?: "sm" | "md";
  className?: string;
}

const SIZES = { sm: "size-6 text-[10px]", md: "size-8 text-xs" } as const;

/** Profile image with an initials fallback (also used when the image fails to load). */
export function Avatar({ src, name, email, size = "md", className }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const label = name || email || "User";
  const showImage = Boolean(src) && !failed;

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        "border border-line bg-sunken font-medium text-ink-secondary",
        SIZES[size],
        className,
      )}
      title={label}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider avatars come from arbitrary hosts
        <img
          src={src ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials(name || email)}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
