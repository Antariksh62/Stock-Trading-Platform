import React from 'react';

function OpenAccount() {
    return (
        <div className='row text_center'>
            
            <h2>Open a Zerodha account</h2>

            <p>Modern platforms and apps, ₹0 investments, and flat ₹20 intraday and F&O trades.</p>

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
       
    );
}

export default OpenAccount;