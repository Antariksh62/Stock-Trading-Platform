import React from 'react';
import { Link } from 'react-router-dom';

function Hero() {
    return (
        <div className="container p-5 mb-5">
            <div className="row text-center">
                
                <div className="col-12 d-flex flex-column align-items-center">
                    
                    <img 
                        src="media/images/homeHero.svg" 
                        alt="Hero" 
                        className="img-fluid mb-5 d-block mx-auto" 
                        style={{ width: "70%", maxWidth: "960px", display: "block", margin: "0 auto" }} 
                    />

                    <h2 className="mt-4">Invest in everything</h2>

                    <p className="fs-5 text-muted my-4">
                        Online platform to invest in stocks, derivatives, mutual funds, ETFs, bonds, and more.
                    </p>

                    <Link 
                        to="/signup"
                        className="p-2 fs-5 text-decoration-none" 
                        style={{
                            width: "20%", 
                            minWidth: "180px",
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
        </div>
    );
}

export default Hero;