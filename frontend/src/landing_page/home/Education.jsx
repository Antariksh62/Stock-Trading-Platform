import React from 'react';

function Education() {
    return (
        <div className="container my-5 py-4">
            <div className="row align-items-center">

                <div className="col-lg-6 col-12 mb-4 mb-lg-0 text-center">
                    <img 
                        src="media/images/education.svg" 
                        alt="Varsity Education" 
                        className="img-fluid"
                        style={{ width: "85%", maxWidth: "480px" }}
                    />
                </div>

                <div className="col-lg-6 col-12 ps-lg-4">
                    <h3 className="mb-4" style={{ color: "#424242", fontWeight: 500, fontSize: "1.6rem" }}>
                        Free and open market education
                    </h3>

                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                        Varsity, the largest online stock market education book in the world covering everything from the basics to advanced trading.
                    </p>
                    <div className="mb-4">
                        <a 
                            href="https://zerodha.com/varsity/" 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}
                        >
                            Varsity &rarr;
                        </a>
                    </div>

                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                        TradingQ&A, the most active trading and investment community in India for all your market related queries.
                    </p>
                    <div>
                        <a 
                            href="https://tradingqna.com/" 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}
                        >
                            TradingQ&A &rarr;
                        </a>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Education;
