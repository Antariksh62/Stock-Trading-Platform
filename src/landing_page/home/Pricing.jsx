import React from 'react';

function Product() {
    return (
        <div className="container mb-5">
            <br /><br /><br /><br /><br />
            <div className="row">

                <div className="col-5">
                    <h4>Unbeatable pricing</h4>

                    <p>We pioneered the concept of discount broking and price transparency in India. Flat fees and no hidden charges.</p>
                    
                    <a 
                        href=""
                        style={{textDecoration : "none"}}
                    >
                        See pricing
                    </a>
                </div>

                <div className="col-7">
                    <img 
                        src="media/images/pricing0.svg" 
                        alt="" 
                        style={{width : "20%"}}
                    />
                    
                    <img 
                        src="media/images/pricingMF.svg" 
                        alt="" 
                        style={{width : "20%"}}
                    />
                    
                    <img 
                        src="media/images/intradayTrades.svg" 
                        alt=""
                        style={{width : "20%"}} 
                    />
                </div>

            </div>

            <br /><br /><br />
        </div>

    );
}

export default Product;