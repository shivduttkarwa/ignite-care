import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { IconSprite } from "./components/Icons";
import { useMe } from "./lib/auth";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";
import Participants from "./screens/Participants";
import ParticipantDetail from "./screens/ParticipantDetail";
import RecordForm from "./screens/RecordForm";
import RecordDetail from "./screens/RecordDetail";
import Records from "./screens/Records";
import Notices from "./screens/Notices";
import Properties from "./screens/Properties";
import Workers from "./screens/Workers";

function Protected({ children }: { children: React.ReactNode }) {
  const { data: me, isPending, isError } = useMe();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="c-signin">
        <p className="u-muted">Loading…</p>
      </div>
    );
  }
  if (isError || !me) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

/* The API refuses these anyway; this turns a 403 into a sensible landing. */
function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.is_manager) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <IconSprite />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <Protected>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/participants" element={<Participants />} />
                <Route path="/participants/:id" element={<ParticipantDetail />} />
                <Route path="/participants/:id/record/new" element={<RecordForm mode="new" />} />
                <Route
                  path="/records"
                  element={
                    <ManagerOnly>
                      <Records />
                    </ManagerOnly>
                  }
                />
                <Route path="/records/:id" element={<RecordDetail />} />
                <Route path="/records/:id/edit" element={<RecordForm mode="edit" />} />
                <Route path="/notices" element={<Notices />} />
                <Route
                  path="/properties"
                  element={
                    <ManagerOnly>
                      <Properties />
                    </ManagerOnly>
                  }
                />
                <Route
                  path="/care-workers"
                  element={
                    <ManagerOnly>
                      <Workers />
                    </ManagerOnly>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Protected>
          }
        />
      </Routes>
    </>
  );
}
