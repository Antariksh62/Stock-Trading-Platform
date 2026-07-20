import React from 'react';

function Stats() {
    return (
        <div className="container">
            <div className="row">

                <div className="col-5">
                    <h3>Trust with confidence</h3>

                    <br />

                    <h4>Customer-first always</h4>
                    <p>That's why 1.6+ crore customers trust Zerodha with ~ ₹6 lakh crores of equity investments, making us India’s largest broker; contributing to 15% of daily retail exchange volumes in India.</p>

                    <br />

                    <h4>No spam or gimmicks</h4>
                    <p>No gimmicks, spam, "gamification", or annoying push notifications. High quality apps that you use at your pace, the way you like. Our philosophies.</p>

                    <br />

                    <h4>The Zerodha universe</h4>
                    <p>Not just an app, but a whole ecosystem. Our investments in 30+ fintech startups offer you tailored services specific to your needs.</p>

                    <br />

                    <h4>Do better with money</h4>
                    <p>With initiatives like Nudge and Kill Switch, we don't just facilitate transactions, but actively help you do better with your money.</p>
                </div>

                <div className="col-7 mb-5">
                    <img 
                        src="media\images\ecosystem.png" 
                        alt="" 
                        className='img-fluid mb-4'
                        style={{width : "100%"}}
                    />

                    <a 
                        href=""
                        style={{textDecoration : "none", marginRight : "5%", marginLeft : "25%"}}
                    >
                        Explore our products
                    </a>

                    <a 
                        href=""
                        style={{textDecoration : "none"}}
                    >
                        Try Kite demo
                    </a>
                </div>

                <img 
                    src="media\images/pressLogos.png" 
                    alt="" 
                    className='mx-auto d-block'
                    style={{width : "60%"}}
                />

            </div>
        </div>
    );
}

export default Stats;
