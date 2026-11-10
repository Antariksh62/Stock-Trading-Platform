import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function Navbar() {
    const [showTrialModal, setShowTrialModal] = useState(false);

    const handleDashboardClick = (e) => {
        e.preventDefault();
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
        if (token) {
            window.location.href = "/dashboard";
        } else {
            setShowTrialModal(true);
        }
    };

    return (
        <>
            <nav className="max-w-7xl mx-auto px-4 lg:px-8 border-b border-gray-200 bg-white font-sans" style={{ maxWidth: "1140px" }}>
                <div className="flex justify-between items-center h-16 w-full">
                    
                    {/* Logo Area */}
                    <div className="flex-shrink-0 cursor-pointer">
                        <Link to="/" className="no-underline outline-none">
                            <img
                                src="media/images/logo.svg"
                                alt="Zerodha Logo"
                                className="h-4 sm:ml-4" 
                            />
                        </Link>
                    </div>

                    {/* Mobile Hamburger Button */}
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
                        <a 
                            href="/dashboard" 
                            onClick={handleDashboardClick}
                            className="text-blue-600 font-semibold no-underline hover:text-blue-800 transition-colors focus:outline-none"
                        >
                            Dashboard
                        </a>
                        
                        {/* Hamburger icon beside support */}
                        <button className="text-gray-500 hover:text-gray-800 ml-4 focus:outline-none hidden lg:block">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Trial Notice Modal */}
            {showTrialModal && (
                <div 
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: "16px",
                    }}
                    onClick={() => setShowTrialModal(false)}
                >
                    <div 
                        style={{
                            backgroundColor: "#fff",
                            borderRadius: "8px",
                            maxWidth: "460px",
                            width: "100%",
                            padding: "28px 24px",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                            position: "relative",
                            fontFamily: "Inter, sans-serif",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setShowTrialModal(false)}
                            style={{
                                position: "absolute",
                                top: "14px",
                                right: "16px",
                                background: "none",
                                border: "none",
                                fontSize: "1.2rem",
                                color: "#999",
                                cursor: "pointer",
                            }}
                        >
                            ✕
                        </button>

                        <div style={{ display: "inline-block", backgroundColor: "#fff3cd", color: "#856404", fontSize: "0.75rem", fontWeight: "700", padding: "3px 8px", borderRadius: "3px", marginBottom: "12px" }}>
                            ⚡ GUEST TRIAL SESSION
                        </div>

                        <h3 style={{ fontSize: "1.25rem", color: "#333", fontWeight: "600", marginBottom: "10px" }}>
                            Explore Kite in Practice Mode
                        </h3>

                        <p style={{ color: "#666", fontSize: "0.9rem", lineHeight: "1.6", marginBottom: "20px" }}>
                            You are entering the Zerodha Kite Trading Terminal in <strong>Guest Trial Mode</strong>. You will be provided virtual capital to test real-time watchlists, charts, and place simulated orders.
                            <br /><br />
                            <em>Note: To permanently record your holdings and portfolio history, you will need to sign in or create an account.</em>
                        </p>

                        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => {
                                    window.location.href = "/signup";
                                }}
                                style={{
                                    backgroundColor: "#fff",
                                    border: "1px solid #387ed1",
                                    color: "#387ed1",
                                    padding: "8px 16px",
                                    borderRadius: "4px",
                                    fontWeight: "500",
                                    fontSize: "0.85rem",
                                    cursor: "pointer",
                                }}
                            >
                                Sign In / Register
                            </button>

                            <button
                                onClick={() => {
                                    window.location.href = "/dashboard?trial=true";
                                }}
                                style={{
                                    backgroundColor: "#387ed1",
                                    border: "none",
                                    color: "#fff",
                                    padding: "8px 18px",
                                    borderRadius: "4px",
                                    fontWeight: "500",
                                    fontSize: "0.85rem",
                                    cursor: "pointer",
                                }}
                            >
                                Continue to Trial &rarr;
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default Navbar;
