import React from "react";
import type { RepoContributorStat } from "../types";
import { getContributorColumns } from "../lib/contributorColumns";
import { DataTable } from "./DataTable";
import { LoadingSkeleton } from "./LoadingSkeleton";

const columns = getContributorColumns();

interface ContributorGridProps {
    contributors: RepoContributorStat[] | undefined;
    loading: boolean;
}

export function ContributorGrid({ contributors, loading }: ContributorGridProps) {
    if (loading) {
        return (
            <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                    <LoadingSkeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
            </div>
        );
    }

    if (!contributors?.length) {
        return <div className="p-12 text-center text-gray-400">No contributors found.</div>;
    }

    return <DataTable columns={columns} data={contributors} />;
}
