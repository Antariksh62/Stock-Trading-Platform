import React, { useState } from "react";
import { Link } from "react-router-dom";


const Menu = () => {

  const [selectedMenu, setSelectedMenu] = useState(0);
  const [isProfileDropDownOpen, setIsProfileDropDownOpen] = useState(false);

  const handleMenuClick = (index) => {
    setSelectedMenu(index);
  }

  const handleProfileClick = (index) => {
    setIsProfileDropDownOpen(!isProfileDropDownOpen);
  }

  const menuCLass = "menu";
  const activeMenuClass = "menu selected";





  return (
    <div className="menu-container">
      <img src="logo.png" style={{ width: "50px" }} />
      <div className="menus">
        <ul>

          <li>
            <Link
              style = {{textDecoration : 'none'}}
              to = '/orders'
              onClick={ () => {handleMenuClick(0)}}
            >
              <p className={selectedMenu === 0 ? activeMenuClass : menuCLass}  >Dashboard</p>
            </Link>
          </li>

          <li>
            <Link
              style = {{textDecoration : 'none'}}
              to = '/orders'
              onClick={ () => {handleMenuClick(1)}}
            >
            <p className={selectedMenu === 1 ? activeMenuClass : menuCLass}  >Orders</p>
            </Link>
          </li>

          <li>
            <Link
              style = {{textDecoration : 'none'}}
              to = '/holdings'
              onClick={ () => {handleMenuClick(2)}}
            >
            <p className={selectedMenu === 2 ? activeMenuClass : menuCLass}  >Holdings</p>
            </Link>
          </li>

          <li>
            <Link
              style = {{textDecoration : 'none'}}
              to = '/positions'
              onClick={ () => {handleMenuClick(3)}}
            >
            <p className={selectedMenu === 3 ? activeMenuClass : menuCLass}  >Positions</p>
            </Link>
          </li>

          <li>
            <Link
              style = {{textDecoration : 'none'}}
              to = '/funds'
              onClick={ () => {handleMenuClick(4)}}
            >
            <p className={selectedMenu === 4 ? activeMenuClass : menuCLass}  >Funds</p>
            </Link>
          </li>

          <li>
            <Link
              style = {{textDecoration : 'none'}}
              to = '/apps'
              onClick={ () => {handleMenuClick(5)}}
            >
            <p className={selectedMenu === 5 ? activeMenuClass : menuCLass}  >Apps</p>
            </Link>
          </li>
        </ul>

        <hr />
        <div className="profile" onClick={handleProfileClick}>
          <div className="avatar">ZU</div>
          <p className="username">USERID</p>
        </div>
      </div>
    </div>
  );
};

export default Menu;
