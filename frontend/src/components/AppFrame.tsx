import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import type { Me } from "../api/types";
import { useSignOut } from "../lib/auth";
import { Icon } from "./Icons";

type Props = {
  me: Me;
  title: string;
  actions?: React.ReactNode;
  back?: { to: string; label: string };
  narrow?: boolean;
  children: React.ReactNode;
};

type NavItem = { to: string; icon: string; label: string; badge?: number };

export function AppFrame({ me, title, actions, back, narrow, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const signOut = useSignOut();
  const location = useLocation();

  // A tap that navigates should also close the drawer.
  useEffect(() => setNavOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shiftGroup: NavItem[] = [
    { to: "/", icon: "grid", label: me.is_manager ? "Overview" : "Today's shift" },
    { to: "/participants", icon: "users", label: "Participants" },
    { to: "/notices", icon: "bell", label: "Notices" },
  ];
  const managerGroup: NavItem[] = [{ to: "/records", icon: "list", label: "All records" }];
  const serviceGroup: NavItem[] = [
    { to: "/properties", icon: "building", label: "Properties" },
    { to: "/care-workers", icon: "badge", label: "Care workers" },
  ];

  return (
    <div className="c-app">
      {navOpen && <div className="c-nav__scrim" onClick={() => setNavOpen(false)} />}

      <nav className="c-nav" data-open={String(navOpen)} aria-label="Main">
        <NavLink className="c-nav__brand" to="/">
          <img src="/logo-full.webp" width={480} height={219} alt="Ignite Community Services" />
        </NavLink>

        <div className="c-nav__group">
          <p className="c-nav__grouplabel">{me.is_manager ? "Oversight" : "My shift"}</p>
          <div className="c-nav__list">
            {shiftGroup.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className="c-nav__link">
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        {me.is_manager && (
          <>
            <div className="c-nav__group">
              <p className="c-nav__grouplabel">Records</p>
              <div className="c-nav__list">
                {managerGroup.map((item) => (
                  <NavLink key={item.to} to={item.to} className="c-nav__link">
                    <Icon name={item.icon} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
            <div className="c-nav__group">
              <p className="c-nav__grouplabel">Service</p>
              <div className="c-nav__list">
                {serviceGroup.map((item) => (
                  <NavLink key={item.to} to={item.to} className="c-nav__link">
                    <Icon name={item.icon} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="c-nav__foot">
          <div className="c-nav__user">
            <span
              className={`c-avatar c-avatar--sm${me.is_manager ? " c-avatar--accent" : ""}`}
              aria-hidden="true"
            >
              {me.initials}
            </span>
            <span>
              <span className="c-nav__username">{me.full_name || me.username}</span>
              <br />
              <span className="c-nav__userrole">
                {me.is_manager ? "Manager" : "Support worker"}
              </span>
            </span>
          </div>
          <button
            type="button"
            className="c-btn c-btn--block c-btn--sm"
            style={{ marginTop: "var(--space-2)" }}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="c-main">
        <header className="c-top">
          {back ? (
            <NavLink className="c-top__back" to={back.to} aria-label={back.label}>
              <Icon name="chevron-left" />
            </NavLink>
          ) : (
            <button
              type="button"
              className="c-top__burger"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              aria-expanded={navOpen}
            >
              <Icon name="menu" />
            </button>
          )}

          {!back && (
            <NavLink className="c-top__logo" to="/">
              <img src="/logo-full.webp" width={480} height={219} alt="Ignite Community Services" />
            </NavLink>
          )}

          <span className={back ? "c-top__title" : "c-top__title u-hide-sm"}>{title}</span>
          <div className="c-top__end">{actions}</div>
        </header>

        <main id="main" className={`c-page${narrow ? " c-page--narrow" : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
