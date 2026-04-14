import type { RepoContributorStat } from "@github-sights/shared";
import React, { useMemo } from "react";
import { BotFilterToggle } from "../../../shared/components/BotFilterToggle";
import { DataTable } from "../../../shared/components/DataTable";
import { LoadingSkeleton } from "../../../shared/components/LoadingSkeleton";
import { useHideBots } from "../../../shared/hooks/useHideBots";
import { isBot } from "../../../shared/lib/botFilter";
import { getContributorColumns } from "../../../shared/lib/contributorColumns";

interface ContributorGridProps {
    contributors: RepoContributorStat[] | undefined;
    loading: boolean;
    owner: string;
}

export function ContributorGrid({ contributors, loading, owner }: ContributorGridProps) {
    const [hideBots, setHideBots] = useHideBots();
    const columns = useMemo(
        () => getContributorColumns({ linkBase: `/${owner}/contributors` }),
        [owner]
    );

    const filtered = useMemo(() => {
        if (!contributors || !hideBots) return contributors;
        return contributors.filter((c) => !isBot(c.login));
    }, [contributors, hideBots]);

    if (loading) {
        return (
            <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                    <LoadingSkeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
            </div>
        );
    }

    if (!filtered?.length) {
        return (
            <div className="p-12 text-center text-gray-400">
                No contributor activity found for this repository.
            </div>
        );
    }

    return (
        <div>
            <div className="px-6 pt-4 flex justify-end">
                <BotFilterToggle hideBots={hideBots} onChange={setHideBots} />
            </div>
            <DataTable
                columns={columns}
                data={filtered}
                searchPlaceholder="Search contributors..."
            />
        </div>
    );
}
