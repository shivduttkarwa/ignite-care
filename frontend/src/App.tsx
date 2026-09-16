import { Suspense, lazy } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  type RouteObject,
} from "react-router-dom";

import { IconSprite } from "./components/Icons";
import { useMe } from "./lib/auth";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";
import Participants from "./screens/Participants";
import ParticipantDetail from "./screens/ParticipantDetail";
import RecordForm from "./screens/RecordForm";
import RecordDetail from "./screens/RecordDetail";
import AttachmentForm from "./screens/AttachmentForm";
import Records from "./screens/Records";
import Notices from "./screens/Notices";
import Properties from "./screens/Properties";
import Workers from "./screens/Workers";

const RecordPreview = lazy(() => import("./screens/RecordPreview"));

function Pending() {
  return (
    <div className="c-signin">
      <p className="u-muted">Loading…</p>
    </div>
  );
}

function Root() {
  return (
    <>
      <IconSprite />
      <Outlet />
    </>
  );
}

function Protected() {
  const { data: me, isPending, isError } = useMe();
  const location = useLocation();

  if (isPending) return <Pending />;
  if (isError || !me) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

/* The API refuses these anyway; this turns a 403 into a sensible landing. */
function ManagerOnly() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.is_manager) return <Navigate to="/" replace />;
  return <Outlet />;
}

const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: "/login", element: <Login /> },
      {
        element: <Protected />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "participants", element: <Participants /> },
          { path: "participants/:id", element: <ParticipantDetail /> },
          { path: "participants/:id/record/new", element: <RecordForm mode="new" /> },
          { path: "records/:id", element: <RecordDetail /> },
          { path: "records/:id/edit", element: <RecordForm mode="edit" /> },
          {
            path: "records/:id/preview",
            element: (
              <Suspense fallback={<Pending />}>
                <RecordPreview />
              </Suspense>
            ),
          },
          { path: "records/:recordId/attachments/:id", element: <AttachmentForm /> },
          { path: "notices", element: <Notices /> },
          {
            element: <ManagerOnly />,
            children: [
              { path: "records", element: <Records /> },
              { path: "properties", element: <Properties /> },
              { path: "care-workers", element: <Workers /> },
            ],
          },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
