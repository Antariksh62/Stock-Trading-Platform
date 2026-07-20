import React from 'react';

function Universe() {
    return (
        <div className="container">

            <div className="row text-center">

                <h1>The Zerodha Universe</h1>
                <p>Extend your trading and investment experience even further with our partner platforms</p>

                <br /><br /><br />

                <div className="col-4 p-3">
                    <img src="media\images\zerodhaFundhouse.png" alt="" style={{ height: '70px', width: '250px', marginBottom: '5px' }} />
                    <p>Our asset management venture that is creating simple and transparent index funds to help you save for your goals.</p>
                </div>

                <div className="col-4 p-3">
                    <img src="media\images\sensibullLogo.svg" alt="" style={{ height: '40px', width: '300px', marginBottom: '15px' }} />
                    <p>Options trading platform that lets you create strategies, analyze positions, and examine data points like open interest, FII/DII, and more.</p>
                </div>

                <div className="col-4 p-3">
                    <img src="media\images\tijori.svg" alt="" style={{ height: '40px', width: '300px', marginBottom: '15px' }} />
                    <p>Investment research platform that offers detailed insights on stocks, sectors, supply chains, and more.</p>
                </div>



                <div className="col-4 p-3">
                    <img src="media\images\streakLogo.png" alt="" style={{ height: '40px', width: '120px', marginBottom: '15px' }} />
                    <p>Systematic trading platform
                        that allows you to create and backtest
                        strategies without coding.</p>
                </div>

                <div className="col-4 p-3">
                    <img src="media\images\smallcaseLogo.png" alt="" style={{ height: '40px', width: '120px', marginBottom: '15px' }} />
                    <p>Thematic investing platform
                        that helps you invest in diversified
                        baskets of stocks on ETFs.</p>
                </div>

                <div className="col-4 p-3">
                    <img src="media\images\dittoLogo.png" alt="" style={{ height: '40px', width: '120px', marginBottom: '15px' }} />
                    <p>Personalized advice on life
                        and health insurance. No spam
                        and no mis-selling.</p>
                </div>

                <br /><br /><br /><br /><br /><br /><br /><br />

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


            <br /><br /><br />
        </div>
        
    );
}

export default Universe;