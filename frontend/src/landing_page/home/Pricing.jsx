import React from 'react';

function Product() {
    return (
        <div className="container my-5 py-4">
            <div className="row align-items-center">

                <div className="col-lg-5 col-12 mb-4 mb-lg-0">
                    <h3 className="mb-3" style={{ fontWeight: 500, fontSize: "1.75rem", color: "#444" }}>
                        Unbeatable pricing
                    </h3>

                    <p style={{ color: "#666", lineHeight: "1.7", fontSize: "0.95rem" }}>
                        We pioneered the concept of discount broking and price transparency in India. Flat fees and no hidden charges.
                    </p>
                    
                    <a 
                        href="/pricing"
                        style={{ textDecoration: "none", color: "#387ed1", fontWeight: "500", fontSize: "0.95rem" }}
                    >
                        See pricing &rarr;
                    </a>
                </div>

                <div className="col-lg-7 col-12">
                    <div className="row align-items-center">
                        <div className="col-4 d-flex align-items-center" style={{ gap: "10px" }}>
                            <img 
                                src="media/images/pricing0.svg" 
                                alt="Free account opening" 
                                style={{ width: "85px", maxWidth: "100%", height: "auto", flexShrink: 0 }}
                            />
                            <p style={{ margin: 0, fontSize: "0.72rem", color: "#666", lineHeight: "1.35" }}>
                                Free account<br />opening
                            </p>
                        </div>

                        <div className="col-4 d-flex align-items-center" style={{ gap: "10px" }}>
                            <img 
                                src="media/images/pricing0.svg" 
                                alt="Free equity delivery and direct mutual funds" 
                                style={{ width: "85px", maxWidth: "100%", height: "auto", flexShrink: 0 }}
                            />
                            <p style={{ margin: 0, fontSize: "0.72rem", color: "#666", lineHeight: "1.35" }}>
                                Free equity delivery<br />and direct mutual funds
                            </p>
                        </div>

                        <div className="col-4 d-flex align-items-center" style={{ gap: "10px" }}>
                            <img 
                                src="media/images/intradayTrades.svg" 
                                alt="Intraday and F&O" 
                                style={{ width: "85px", maxWidth: "100%", height: "auto", flexShrink: 0 }}
                            />
                            <p style={{ margin: 0, fontSize: "0.72rem", color: "#666", lineHeight: "1.35" }}>
                                Intraday and<br />F&O
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Product;