import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { Notice } from "../api/types";
import { AppFrame } from "../components/AppFrame";
import { EmptyState, ErrorState, Loading, clock, shortDate } from "../components/bits";
import { useMe } from "../lib/auth";

export default function Notices() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  const notices = useQuery({
    queryKey: ["notices"],
    queryFn: () => api.get<{ unread_count: number; results: Notice[] }>("/notices/"),
  });

  // Opening the page marks them read, the way the paper noticeboard works.
  useEffect(() => {
    if (notices.data && notices.data.unread_count > 0) {
      api.post("/notices/read/", {}).then(() => {
        queryClient.invalidateQueries({ queryKey: ["notices"] });
      });
    }
  }, [notices.data, queryClient]);

  if (!me) return null;

  return (
    <AppFrame me={me} title="Notices" narrow>
      <div className="c-pagehead">
        <div>
          <h1 className="c-pagehead__title">Notices</h1>
          <p className="c-pagehead__sub">
            Posts from your manager and the team. Opening this page marks them read.
          </p>
        </div>
      </div>

      {notices.isPending && <Loading />}
      {notices.isError && <ErrorState error={notices.error} onRetry={() => notices.refetch()} />}

      {notices.data?.results.length === 0 && (
        <div className="c-panel">
          <EmptyState icon="bell" title="No notices yet"
                      body="When your manager publishes a notice it appears here and on your dashboard." />
        </div>
      )}

      {notices.data?.results.map((notice) => (
        <article key={notice.id} className={`c-notice${notice.is_unread ? " c-notice--unread" : ""}`}>
          <p className="c-notice__meta">
            {notice.is_unread && <span className="c-notice__dot" aria-hidden="true" />}
            {notice.author_name}
            {notice.author_is_manager && <span className="c-rolebadge">Manager</span>}
            {" · "}{shortDate(notice.published_at.slice(0, 10))}, {clock(notice.published_at)}
            {notice.is_pinned && <> · <strong>Pinned</strong></>}
          </p>
          <h2 className="c-notice__title">{notice.title}</h2>
          <p className="c-notice__body" style={{ WebkitLineClamp: "initial", display: "block" }}>
            {notice.body}
          </p>
        </article>
      ))}
    </AppFrame>
  );
}
