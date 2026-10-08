import React from "react";
import Dashboard from "./Dashboard";
import TopBar from "./TopBar";
import { GeneralContextProvider } from "./GeneralContext";

const Home = () => {
  return (
    <GeneralContextProvider>
      <TopBar />
      <Dashboard />
    </GeneralContextProvider>
  );
};

export default Home;
