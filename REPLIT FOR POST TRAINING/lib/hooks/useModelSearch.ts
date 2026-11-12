"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { modelProvider } from "@/lib/providers/model-provider";
import type { OpenModel } from "@/lib/types";

const DEBOUNCE_MS = 350;
const RESULT_LIMIT = 20;

export interface ModelSearchState {
  query: string;
  setQuery: (value: string) => void;
  results: OpenModel[];
  loading: boolean;
  error: string | null;
  isInitialLoad: boolean;
  retry: () => void;
}

/**
 * Debounced model search with stale-request protection, against whichever
 * `ModelProvider` is active (currently the curated catalog; see
 * lib/providers/model-provider.ts).
 *
 * Only fetches while `active` is true, so opening the model picker is what
 * triggers the first request rather than the page loading. Both an
 * AbortController and a monotonic request id guard against an older
 * response overwriting a newer one (e.g. typing "Qw" then "Qwen" quickly).
 */
export function useModelSearch(active: boolean): ModelSearchState {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback((searchQuery: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    modelProvider
      .searchModels({ query: searchQuery, limit: RESULT_LIMIT, signal: controller.signal })
      .then((models) => {
        if (requestId !== requestIdRef.current) return; // superseded by a newer search
        setResults(models);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Couldn't load models.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!active) return;
    // The first load (empty query) fires immediately; typed queries debounce.
    const delayMs = query ? DEBOUNCE_MS : 0;
    const timer = setTimeout(() => runSearch(query), delayMs);
    return () => clearTimeout(timer);
  }, [query, active, runSearch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const retry = useCallback(() => runSearch(query), [runSearch, query]);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    isInitialLoad: query.length === 0,
    retry,
  };
}
