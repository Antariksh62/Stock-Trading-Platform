import React, { Component } from 'react';

function Team() {
    return (
        <>
            <div className="container">
                <div className="col fs-4 text-center mt-5 mb-2" >
                    <br />
                    <p>People</p>
                    <br />
                </div>
            </div>

            <div className="container mb-5 pb-5">
                <div className="row justify-content-center align-items-center">
                    <div className="col-lg-5 col-12 d-flex flex-column align-items-center text-center mb-4 mb-lg-0">
                        <img 
                            src="media/images/nithinKamath.jpg" 
                            alt="Nithin Kamath" 
                            style={{ 
                                borderRadius: '50%', 
                                width: '220px', 
                                height: '220px', 
                                objectFit: 'cover',
                                display: 'block',
                                margin: '0 auto' 
                            }} 
                        />
                        <h5 className="mt-3 mb-1" style={{ color: "#424242", fontWeight: 500, fontSize: "1.1rem" }}>
                            Nithin Kamath
                        </h5>
                        <p className="text-muted" style={{ fontSize: "0.9rem", margin: 0 }}>
                            Founder, CEO
                        </p>
                    </div>

                    <div className="col-lg-6 col-12" style={{ lineHeight: "1.8", color: "#666", fontSize: "0.95rem" }}>
                        <p>Nithin bootstrapped and founded Zerodha in 2010 to overcome the hurdles he faced during his decade long stint as a trader. Today, Zerodha has changed the landscape of the Indian broking industry.</p>

                        <p>He is a member of the SEBI Secondary Market Advisory Committee (SMAC) and the Market Data Advisory Committee (MDAC).</p>
                    
                        <p>Playing basketball is his zen.</p>

                        <p>
                            Connect on{" "}
                            <a href="https://nithinkamath.me" target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "#387ed1" }}>Homepage</a> /{" "}
                            <a href="https://tradingqna.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "#387ed1" }}>TradingQnA</a> /{" "}
                            <a href="https://twitter.com/Nithin0dha" target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "#387ed1" }}>Twitter</a>
                        </p>
                    </div>
                </div>
            </div>
        </>


    );
}

export default Team;