import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const Menu = () => {
  const [selectedMenu, setSelectedMenu] = useState(0);
  const [isProfileDropDownOpen, setIsProfileDropDownOpen] = useState(false);
  const [username, setUsername] = useState("USERID");

  useEffect(() => {
    // 1. Try reading from localStorage first for instant display
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed.username) setUsername(parsed.username.toUpperCase());
      } catch (e) {
        console.error(e);
      }
    }

    // 2. Verify with backend token
    axios
      .post("http://localhost:3001/verify", {}, { withCredentials: true })
      .then((res) => {
        if (res.data.status && res.data.user) {
          setUsername(res.data.user.toUpperCase());
        }
      })
      .catch((err) => {
        console.error("Auth check failed:", err);
      });
  }, []);

  const handleMenuClick = (index) => {
    setSelectedMenu(index);
  };

  const handleProfileClick = () => {
    setIsProfileDropDownOpen(!isProfileDropDownOpen);
  };

  const handleLogout = async () => {
    try {
      await axios.post(
        "http://localhost:3001/logout",
        {},
        { withCredentials: true }
      );
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = "http://localhost:5173/signup";
  };

  const avatarText = username.slice(0, 2) || "ZU";

  const menuCLass = "menu";
  const activeMenuClass = "menu selected";

  return (
    <div className="menu-container" style={{ position: "relative" }}>
      <img src="logo.png" style={{ width: "50px" }} alt="Zerodha Logo" />
      <div className="menus">
        <ul>
          <li>
            <Link
              style={{ textDecoration: "none" }}
              to="/"
              onClick={() => {
                handleMenuClick(0);
              }}
            >
              <p className={selectedMenu === 0 ? activeMenuClass : menuCLass}>
                Dashboard
              </p>
            </Link>
          </li>

          <li>
            <Link
              style={{ textDecoration: "none" }}
              to="/orders"
              onClick={() => {
                handleMenuClick(1);
              }}
            >
              <p className={selectedMenu === 1 ? activeMenuClass : menuCLass}>
                Orders
              </p>
            </Link>
          </li>

          <li>
            <Link
              style={{ textDecoration: "none" }}
              to="/holdings"
              onClick={() => {
                handleMenuClick(2);
              }}
            >
              <p className={selectedMenu === 2 ? activeMenuClass : menuCLass}>
                Holdings
              </p>
            </Link>
          </li>

          <li>
            <Link
              style={{ textDecoration: "none" }}
              to="/positions"
              onClick={() => {
                handleMenuClick(3);
              }}
            >
              <p className={selectedMenu === 3 ? activeMenuClass : menuCLass}>
                Positions
              </p>
            </Link>
          </li>

          <li>
            <Link
              style={{ textDecoration: "none" }}
              to="/funds"
              onClick={() => {
                handleMenuClick(4);
              }}
            >
              <p className={selectedMenu === 4 ? activeMenuClass : menuCLass}>
                Funds
              </p>
            </Link>
          </li>

          <li>
            <Link
              style={{ textDecoration: "none" }}
              to="/apps"
              onClick={() => {
                handleMenuClick(5);
              }}
            >
              <p className={selectedMenu === 5 ? activeMenuClass : menuCLass}>
                Apps
              </p>
            </Link>
          </li>
        </ul>

        <hr />
        <div
          className="profile"
          onClick={handleProfileClick}
          style={{ position: "relative", cursor: "pointer" }}
        >
          <div className="avatar">{avatarText}</div>
          <p className="username">{username}</p>

          {isProfileDropDownOpen && (
            <div
              style={{
                position: "absolute",
                top: "42px",
                right: "0",
                backgroundColor: "#fff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                borderRadius: "4px",
                padding: "10px 16px",
                zIndex: 1000,
                minWidth: "150px",
                border: "1px solid #eee",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: "8px", fontWeight: "500", fontSize: "0.85rem" }}>
                {username}
              </div>
              <button
                onClick={handleLogout}
                style={{
                  background: "#ff5722",
                  color: "#fff",
                  border: "none",
                  borderRadius: "3px",
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Menu;
