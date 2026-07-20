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

            <div className="conatiner">
                <div className="row justify-content-center">
                    <div className="col-4 text-center">
                        <img src="media/images/nithinKamath.jpg" alt="" style={{borderRadius : '100%' , width : '50%'}} />
                        
                        <p className='mt-3 fs-5 mb-1'>Nithin Kamath</p>
                        <p>Founder, CEO</p>
                    </div>

                    <div className="col-4">
                        <p>Nithin bootstrapped and founded Zerodha in 2010 to overcome the hurdles he faced during his decade long stint as a trader. Today, Zerodha has changed the landscape of the Indian broking industry.</p>

                        <p>He is a member of the SEBI Secondary Market Advisory Committee (SMAC) and the Market Data Advisory Committee (MDAC).</p>
                    
                        <p>Playing basketball is his zen.</p>

                        <p>Connect on Homepage / TradingQnA / Twitter</p>
                    </div>
                </div>
            </div>
        </>


    );
}

export default Team;