import React, { useEffect } from "react";
import Dashboard from "./Dashboard";
import TopBar from "./TopBar";
import { GeneralContextProvider } from "./GeneralContext";

const Home = () => {
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      const user = urlParams.get("user");
      if (token) {
        localStorage.setItem("token", token);
      }
      if (user) {
        localStorage.setItem("user", decodeURIComponent(user));
      }
      if (token || user) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn("Error synchronizing cross-origin session:", e);
    }
  }, []);

  return (
    <GeneralContextProvider>
      <TopBar />
      <Dashboard />
    </GeneralContextProvider>
  );
};

export default Home;
