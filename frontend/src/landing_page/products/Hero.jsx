import React from "react";

function Hero() {
    return (
        <div className="container border-bottom mb-5">
            <div className="text-center mt-5 mb-5">
                <br /><br />
                <h2>Zerodha Products</h2>
                <h3 className="text-muted mt-3 fs-4">
                    Sleek, modern and intuitive trading platforms
                </h3>
                <p className="mt-3">
                    Check out our{" "}
                    <a href="" style={{ textDecoration: "none" }}>
                        investment offerings{" "}
                        <i className="fa fa-long-arrow-right" aria-hidden="true"></i>
                    </a>
                </p>
                <br /><br />
            </div>
        </div>


    );
}

export default Hero;