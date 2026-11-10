import React from 'react';

function Stats() {
    return (
        <div className="container my-5 py-4">
            <div className="row align-items-center">

                {/* Left Column: Value Proposition */}
                <div className="col-lg-5 col-12 pe-lg-4 mb-4 mb-lg-0">
                    <h2 className="mb-4" style={{ fontSize: "2rem", fontWeight: 500, color: "#424242" }}>
                        Trust with confidence
                    </h2>

                    <h4 style={{ fontSize: "1.25rem", fontWeight: 500, color: "#424242", marginTop: "1.5rem", marginBottom: "0.5rem" }}>
                        Customer-first always
                    </h4>
                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                        That's why 1.8+ crore customers trust Zerodha with ~ ₹9 lakh crores of equity investments, making us India’s largest broker; contributing to 15% of daily retail exchange volumes in India.
                    </p>

                    <h4 style={{ fontSize: "1.25rem", fontWeight: 500, color: "#424242", marginBottom: "0.5rem" }}>
                        No spam or gimmicks
                    </h4>
                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                        No gimmicks, spam, "gamification", or annoying push notifications. High quality apps that you use at your pace, the way you like. Our philosophies.
                    </p>

                    <h4 style={{ fontSize: "1.25rem", fontWeight: 500, color: "#424242", marginBottom: "0.5rem" }}>
                        The Zerodha universe
                    </h4>
                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                        Not just an app, but a whole ecosystem. Our investments in 30+ fintech startups offer you tailored services specific to your needs.
                    </p>

                    <h4 style={{ fontSize: "1.25rem", fontWeight: 500, color: "#424242", marginBottom: "0.5rem" }}>
                        Do better with money
                    </h4>
                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                        With initiatives like Nudge and Kill Switch, we don't just facilitate transactions, but actively help you do better with your money.
                    </p>
                </div>

                {/* Right Column: Universe Graphic and Links */}
                <div className="col-lg-7 col-12 text-center mb-4">
                    <img 
                        src="media/images/ecosystem.png" 
                        alt="Zerodha Ecosystem" 
                        className="img-fluid mb-4"
                        style={{ width: "95%", maxWidth: "620px" }}
                    />

                    <div className="d-flex justify-content-center align-items-center" style={{ gap: "35px" }}>
                        <a 
                            href="/productpage"
                            style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}
                        >
                            Explore our products &rarr;
                        </a>

                        <a 
                            href="/dashboard"
                            style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}
                        >
                            Try Kite demo &rarr;
                        </a>
                    </div>
                </div>

                {/* Press & Media Logos */}
                <div className="col-12 text-center mt-5 pt-3">
                    <img 
                        src="media/images/pressLogos.png" 
                        alt="Featured Press" 
                        className="img-fluid mx-auto d-block"
                        style={{ width: "65%", maxWidth: "680px" }}
                    />
                </div>

            </div>
        </div>
    );
}

export default Stats;
