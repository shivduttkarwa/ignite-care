import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Me } from "../api/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/me/"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await api.post("/auth/logout/");
    queryClient.clear();
    window.location.href = "/login";
  };
}
