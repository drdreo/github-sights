import { useParams } from "react-router-dom";

/**
 * Reads the :owner route param from the URL.
 * Must be used inside a route with /:owner in the path.
 */
export function useOwner(): string {
    const { owner } = useParams<{ owner: string }>();
    return owner || "";
}
