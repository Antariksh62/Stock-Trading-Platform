import React from 'react';

function Hero() {
    return (
        <div className="container p-5 mb-5">
            <div className="row text-center">
                
                <div className="col-12">
                    
                    <img 
                        src="media/images/homeHero.svg" 
                        alt="Hero" 
                        className="img-fluid mb-5" 
                        style={{ width: "60%" }} 
                    />

                    <h2 className="mt-4">Invest in everything</h2>

                    <p className="fs-5 text-muted my-4">
                        Online platform to invest in stocks, derivatives, mutual funds, ETFs, bonds, and more.
                    </p>

                    <button 
                        className="p-2 fs-5" 
                        style={{
                            width: "20%", 
                            margin: "0 auto", 
                            backgroundColor: "rgb(56, 126, 209)", 
                            color: "white", 
                            borderRadius: 5, 
                            border: "none"
                        }} 
                    >
                        Sign up for free
                    </button>

                </div>
            </div>
        </div>
    );
}

export default Hero;