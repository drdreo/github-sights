import React from "react";

interface LoadingSkeletonProps {
    className?: string;
    variant?: "text" | "card" | "circle" | "timeline" | "rect";
    width?: string | number;
    height?: string | number;
}

export function LoadingSkeleton({
    className = "",
    variant = "text",
    width,
    height,
}: LoadingSkeletonProps) {
    const baseClasses = "animate-pulse bg-gray-800 rounded";

    let variantClasses = "";
    if (variant === "text") variantClasses = "h-4 w-3/4 rounded-full";
    if (variant === "card") variantClasses = "h-32 w-full rounded-xl";
    if (variant === "circle") variantClasses = "h-10 w-10 rounded-full";
    if (variant === "timeline") variantClasses = "h-40 w-full rounded-lg";
    if (variant === "rect") variantClasses = "h-full w-full rounded-md";

    const style: React.CSSProperties = {};
    if (width) style.width = width;
    if (height) style.height = height;

    return (
        <div
            className={`${baseClasses} ${variantClasses} ${className}`}
            style={style}
            aria-hidden="true"
        />
    );
}
