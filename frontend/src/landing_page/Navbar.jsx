import React from 'react';
import { Link } from 'react-router-dom';

function Navbar() {
    return (
        <nav className="max-w-7xl mx-auto px-4 lg:px-8 border-b border-gray-200 bg-white font-sans">
            <div className="flex justify-between items-center h-16 w-full">
                
                {/* Logo Area */}
                <div className="flex-shrink-0 cursor-pointer">
                    <Link to="/" className="no-underline outline-none">
                        <img
                            src="media/images/logo.svg"
                            alt="Zerodha Logo"
                            className="h-4 sm:ml-10" 
                        />
                    </Link>
                </div>

                {/* Mobile Hamburger Button (Functionality removed for now) */}
                <button
                    className="md:hidden text-gray-500 hover:text-gray-800 focus:outline-none"
                    aria-label="Toggle navigation"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                {/* Desktop Navigation Links */}
                <div className="hidden md:flex space-x-8 text-sm font-medium items-center">
                    <Link to="/signup" className="text-gray-500 no-underline hover:text-blue-600 transition-colors focus:outline-none">Signup</Link>
                    <Link to="/aboutpage" className="text-gray-500 no-underline hover:text-blue-600 transition-colors focus:outline-none">About</Link>
                    <Link to="/productpage" className="text-gray-500 no-underline hover:text-blue-600 transition-colors focus:outline-none">Products</Link>
                    <Link to="/pricing" className="text-gray-500 no-underline transition-colors focus:outline-none">Pricing</Link>
                    <Link to="/supportpage" className="text-gray-500 no-underline hover:text-blue-600 transition-colors focus:outline-none">Support</Link>
                    
                    {/* Hamburger icon beside support */}
                    <button className="text-gray-500 hover:text-gray-800 ml-4 focus:outline-none hidden lg:block">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
            </div>
        </nav>
    );
}

export default Navbar;