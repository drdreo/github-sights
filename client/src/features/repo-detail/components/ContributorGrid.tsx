import type { RepoContributorStat } from "@github-sights/shared";
import React, { useMemo } from "react";
import { DataTable } from "../../../shared/components/DataTable";
import { LoadingSkeleton } from "../../../shared/components/LoadingSkeleton";
import { getContributorColumns } from "../../../shared/lib/contributorColumns";

interface ContributorGridProps {
    contributors: RepoContributorStat[] | undefined;
    loading: boolean;
    owner: string;
}

export function ContributorGrid({ contributors, loading, owner }: ContributorGridProps) {
    const columns = useMemo(
        () => getContributorColumns({ linkBase: `/${owner}/contributors` }),
        [owner]
    );

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
        return (
            <div className="p-12 text-center text-gray-400">
                No contributor activity found for this repository.
            </div>
        );
    }

    return (
        <DataTable
            columns={columns}
            data={contributors}
            searchPlaceholder="Search contributors..."
        />
    );
}
