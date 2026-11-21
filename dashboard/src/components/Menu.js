import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { API_BASE, FRONTEND_URL } from "../config";
import { socketService } from "../services/socketService";

const NAV_ITEMS = [
  { name: "Dashboard", path: "/", icon: "📊" },
  { name: "Orders", path: "/orders", icon: "📋" },
  { name: "Holdings", path: "/holdings", icon: "💼" },
  { name: "Positions", path: "/positions", icon: "⚡" },
  { name: "Funds", path: "/funds", icon: "💰" },
  { name: "Apps", path: "/apps", icon: "📱" },
];

const Menu = () => {
  const location = useLocation();
  const [isProfileDropDownOpen, setIsProfileDropDownOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [username, setUsername] = useState("USERID");
  const [isGuestUser, setIsGuestUser] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const desktopProfileRef = useRef(null);
  const mobileProfileRef = useRef(null);
  const mobileNavRef = useRef(null);

  useEffect(() => {
    // 1. Try reading from localStorage first for instant display
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!token) {
      setIsGuestUser(true);
    } else {
      setIsGuestUser(false);
    }

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed.username) setUsername(parsed.username.toUpperCase());
      } catch (e) {
        console.error(e);
      }
    }

    // 2. Verify with backend token (support both HTTP-only cookie and Authorization header)
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    axios
      .post(`${API_BASE}/verify`, {}, { withCredentials: true, headers })
      .then((res) => {
        if (res.data && res.data.status && res.data.user) {
          setUsername(res.data.user.toUpperCase());
          setIsGuestUser(false);
          if (res.data.userId) {
            localStorage.setItem(
              "user",
              JSON.stringify({
                id: res.data.userId,
                username: res.data.user,
                email: res.data.email,
              })
            );
          }
        } else if (!token) {
          setIsGuestUser(true);
        }
      })
      .catch(() => {
        setIsGuestUser(!localStorage.getItem("token"));
      });
  }, []);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isInsideDesktop = desktopProfileRef.current && desktopProfileRef.current.contains(e.target);
      const isInsideMobile = mobileProfileRef.current && mobileProfileRef.current.contains(e.target);
      const isInsideDropdownCard = e.target.closest && e.target.closest(".profile-dropdown-card");

      if (!isInsideDesktop && !isInsideMobile && !isInsideDropdownCard) {
        setIsProfileDropDownOpen(false);
      }

      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(e.target) &&
        !e.target.closest(".mobile-nav-toggle")
      ) {
        setIsMobileNavOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsProfileDropDownOpen(false);
        setIsMobileNavOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth >= 992) {
        setIsMobileNavOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Automatically close mobile menu when navigating
  useEffect(() => {
    setIsMobileNavOpen(false);
    setIsProfileDropDownOpen(false);
  }, [location.pathname]);

  const handleProfileClick = () => {
    setIsProfileDropDownOpen((prev) => !prev);
  };

  const handleMobileNavToggle = () => {
    setIsMobileNavOpen((prev) => !prev);
  };

  const handleLogout = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      // 1. Notify backend to clear authentication cookies
      await axios.post(`${API_BASE}/logout`, {}, { withCredentials: true });
    } catch (err) {
      console.warn("Backend logout warning:", err.message);
    } finally {
      // 2. Clear client-side stored session tokens & cached user data
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("user_funds");
      sessionStorage.clear();

      // 3. Clean up Socket.IO connection to stop receiving private updates
      try {
        socketService.disconnect();
      } catch (wsErr) {
        console.warn("Socket cleanup error:", wsErr);
      }

      // 4. Close profile dropdown and reset state
      setIsProfileDropDownOpen(false);
      setUsername("USERID");
      setIsGuestUser(true);
      setIsLoggingOut(false);

      // 5. Authoritative redirect to login screen
      const loginUrl = FRONTEND_URL ? `${FRONTEND_URL}/login` : "/login";
      window.location.href = loginUrl;
    }
  };

  const avatarText = username.slice(0, 2) || "ZU";

  const isRouteActive = (itemPath) => {
    if (itemPath === "/") {
      return location.pathname === "/" || location.pathname === "/dashboard" || location.pathname === "/dashboard/";
    }
    return location.pathname === itemPath || location.pathname === `/dashboard${itemPath}`;
  };

  return (
    <div className="menu-container">
      {/* Zerodha Kite Brand Logo */}
      <Link to="/" className="logo-link" title="Zerodha Kite Trading Terminal">
        <img src="logo.png" className="logo" alt="Zerodha Logo" />
      </Link>

      {/* Desktop Navigation Menu (Screens >= 992px) */}
      <div className="menus desktop-menus">
        <ul>
          {NAV_ITEMS.map((item) => {
            const active = isRouteActive(item.path);
            return (
              <li key={item.path}>
                <Link to={item.path} style={{ textDecoration: "none" }}>
                  <p className={`menu ${active ? "selected" : ""}`}>
                    {item.name}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        <hr className="nav-vertical-divider" />

        {/* User Profile Avatar & Dropdown */}
        <div
          ref={desktopProfileRef}
          className="profile"
          onClick={handleProfileClick}
          title="Account profile & settings"
        >
          <div className="avatar">{avatarText}</div>
          <p className="username">{username}</p>

          {isProfileDropDownOpen && (
            <div
              className="profile-dropdown-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="profile-dropdown-header">
                <div className="dropdown-username">{username}</div>
                <div className="dropdown-status">
                  {isGuestUser ? "Guest Paper Trading" : "Active Client"}
                </div>
              </div>
              <hr className="dropdown-divider" />
              {isGuestUser ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <a
                    href={FRONTEND_URL ? `${FRONTEND_URL}/login` : "/login"}
                    className="dropdown-auth-btn dropdown-login-btn"
                  >
                    Log In
                  </a>
                  <a
                    href={FRONTEND_URL ? `${FRONTEND_URL}/signup` : "/signup"}
                    className="dropdown-auth-btn"
                    style={{
                      backgroundColor: "#ffffff",
                      color: "#387ed1",
                      border: "1px solid #387ed1",
                    }}
                  >
                    Sign Up
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="dropdown-auth-btn dropdown-logout-btn"
                  style={{
                    opacity: isLoggingOut ? 0.7 : 1,
                    cursor: isLoggingOut ? "wait" : "pointer",
                  }}
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile / Tablet Controls (Screens < 992px) */}
      <div className="mobile-controls">
        <div
          className="profile mobile-profile"
          onClick={handleProfileClick}
          ref={mobileProfileRef}
          title="User profile"
        >
          <div className="avatar">{avatarText}</div>
          {isProfileDropDownOpen && (
            <div
              className="profile-dropdown-card mobile-profile-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="profile-dropdown-header">
                <div className="dropdown-username">{username}</div>
                <div className="dropdown-status">
                  {isGuestUser ? "Guest Paper Trading" : "Active Client"}
                </div>
              </div>
              <hr className="dropdown-divider" />
              {isGuestUser ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <a
                    href={FRONTEND_URL ? `${FRONTEND_URL}/login` : "/login"}
                    className="dropdown-auth-btn dropdown-login-btn"
                  >
                    Log In
                  </a>
                  <a
                    href={FRONTEND_URL ? `${FRONTEND_URL}/signup` : "/signup"}
                    className="dropdown-auth-btn"
                    style={{
                      backgroundColor: "#ffffff",
                      color: "#387ed1",
                      border: "1px solid #387ed1",
                    }}
                  >
                    Sign Up
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="dropdown-auth-btn dropdown-logout-btn"
                  style={{
                    opacity: isLoggingOut ? 0.7 : 1,
                    cursor: isLoggingOut ? "wait" : "pointer",
                  }}
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Hamburger Menu Toggle Button */}
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={handleMobileNavToggle}
          aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileNavOpen}
        >
          {isMobileNavOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      {isMobileNavOpen && (
        <div ref={mobileNavRef} className="mobile-nav-drawer" role="dialog" aria-modal="true">
          <div className="mobile-nav-header">
            <div className="mobile-user-info">
              <div className="avatar mobile-drawer-avatar">{avatarText}</div>
              <div>
                <div className="mobile-user-name">{username}</div>
                <div className="mobile-user-badge">
                  {isGuestUser ? "Guest Paper Trading" : "Active Client"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="mobile-drawer-close"
              onClick={() => setIsMobileNavOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className="mobile-nav-list">
            {NAV_ITEMS.map((item) => {
              const active = isRouteActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`mobile-nav-link ${active ? "active" : ""}`}
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  <span className="mobile-nav-icon">{item.icon}</span>
                  <span className="mobile-nav-text">{item.name}</span>
                  {active && <span className="mobile-nav-active-pill">●</span>}
                </Link>
              );
            })}
          </div>

          <div className="mobile-nav-footer">
            {isGuestUser ? (
              <a
                href={FRONTEND_URL ? `${FRONTEND_URL}/signup` : "/signup"}
                className="mobile-auth-btn mobile-login-btn"
                onClick={() => setIsMobileNavOpen(false)}
              >
                Log In / Sign Up
              </a>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                className="mobile-auth-btn mobile-logout-btn"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Menu;
