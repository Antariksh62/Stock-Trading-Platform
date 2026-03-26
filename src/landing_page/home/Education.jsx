import React from 'react';

function Education() {
    return (
        <div className="container mb-5">

            <div className="row">

                <div className="col-6 pb-5">
                    <img 
                        src="media/images/education.svg" 
                        alt="" 
                        style={{width : "80%"}}
                    />
                </div>

                <div className="col-6">
                    <h4>Free and open market education</h4>

                    <p>Varsity, the largest online stock market education book in the world covering everything from the basics to advanced trading.</p>

                    <a 
                        href=""
                        style={{textDecoration : "none"}}
                    >
                        Varisity
                    </a>

                    <br /><br />

                    <p>TradingQ&A, the most active trading and investment community in India for all your market related queries.</p>
                
                    <a 
                        href=""
                        style={{textDecoration : "none"}}
                    >
                        TradingQ&A
                    </a>
                </div>

            </div>

        </div>
    )
}

export default Education;