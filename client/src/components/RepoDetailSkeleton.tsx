import React from "react";
import { LoadingSkeleton } from "./LoadingSkeleton";

export function RepoDetailSkeleton() {
    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <LoadingSkeleton className="h-8 w-32 mb-4" />
            <LoadingSkeleton className="h-48 w-full rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <LoadingSkeleton className="h-32 w-full rounded-xl" />
                <LoadingSkeleton className="h-32 w-full rounded-xl" />
                <LoadingSkeleton className="h-32 w-full rounded-xl" />
            </div>
        </div>
    );
}
