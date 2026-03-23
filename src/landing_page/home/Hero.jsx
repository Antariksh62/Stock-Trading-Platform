import React from 'react';

function Hero() {
    return (
        <div className="container p-5">
            <div className="row text-center">
                <div className="col">
                    <img src="media\images\homeHero.svg"  alt="" className='mb-5'/>
                </div>

                <h1 className='mt-5'>Invest in everything</h1>

                <p>Online platform to invest in stocks, derivatives, mutual funds, ETFs, bonds, and more.</p>

                <button className='p-2 fs-5' style={{width : "15%", margin : "0 auto", backgroundColor : "rgb(56, 126, 209)", color : "white" , borderRadius : 5, border : "none"}} >Sign up for free</button>
            </div>
        </div>
    );
}

export default Hero;