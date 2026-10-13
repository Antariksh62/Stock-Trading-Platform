import React from 'react';
import { Link } from 'react-router-dom';

function Universe() {
    const partners = [
        {
            name: "Zerodha Fundhouse",
            img: "media/images/zerodhaFundhouse.png",
            imgStyle: { maxHeight: "48px", maxWidth: "190px" },
            desc: "Our asset management venture that is creating simple and transparent index funds to help you save for your goals."
        },
        {
            name: "Sensibull",
            img: "media/images/sensibullLogo.svg",
            imgStyle: { maxHeight: "38px", maxWidth: "190px" },
            desc: "Options trading platform that lets you create strategies, analyze positions, and examine data points like open interest, FII/DII, and more."
        },
        {
            name: "Tijori",
            img: "media/images/tijori.svg",
            imgStyle: { maxHeight: "40px", maxWidth: "150px" },
            desc: "Investment research platform that offers detailed insights on stocks, sectors, supply chains, and more."
        },
        {
            name: "Streak",
            img: "media/images/streakLogo.png",
            imgStyle: { maxHeight: "42px", maxWidth: "160px" },
            desc: "Systematic trading platform that allows you to create and backtest strategies without coding."
        },
        {
            name: "smallcase",
            img: "media/images/smallcaseLogo.png",
            imgStyle: { maxHeight: "40px", maxWidth: "170px" },
            desc: "Thematic investing platform that helps you invest in diversified baskets of stocks on ETFs."
        },
        {
            name: "ditto",
            img: "media/images/dittoLogo.png",
            imgStyle: { maxHeight: "40px", maxWidth: "140px" },
            desc: "Personalized advice on life and health insurance. No spam and no mis-selling."
        }
    ];

    return (
        <div className="container my-5 py-5 text-center">
            <h1 className="mb-3" style={{ fontSize: "2rem", fontWeight: "500", color: "#424242" }}>
                The Zerodha Universe
            </h1>
            <p className="text-muted mb-5" style={{ fontSize: "1rem" }}>
                Extend your trading and investment experience even further with our partner platforms
            </p>

            <div className="row g-5 justify-content-center">
                {partners.map((partner, index) => (
                    <div key={index} className="col-lg-4 col-md-6 col-12 d-flex flex-column align-items-center text-center">
                        <div style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", width: "100%" }}>
                            <img 
                                src={partner.img} 
                                alt={partner.name} 
                                style={{ 
                                    ...partner.imgStyle,
                                    width: "auto", 
                                    height: "auto", 
                                    objectFit: "contain",
                                    display: "block",
                                    margin: "0 auto"
                                }} 
                            />
                        </div>
                        <p style={{ fontSize: "0.78rem", color: "#666", lineHeight: "1.6", maxWidth: "290px", margin: "0 auto" }}>
                            {partner.desc}
                        </p>
                    </div>
                ))}
            </div>

            <div className="mt-5 pt-4">
                <Link
                    to="/signup"
                    className="p-2 fs-5 text-decoration-none"
                    style={{
                        width: "20%",
                        minWidth: "190px",
                        margin: "0 auto",
                        backgroundColor: "rgb(56, 126, 209)",
                        color: "white",
                        borderRadius: 5,
                        border: "none",
                        display: "inline-block"
                    }}
                >
                    Sign up for free
                </Link>
            </div>
        </div>
    );
}

export default Universe;