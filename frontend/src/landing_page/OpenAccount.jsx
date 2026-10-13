import React from 'react';
import { Link } from 'react-router-dom';

function OpenAccount() {
    return (
        <div className='container my-5'>

            <div className="row text-center">

                <div className="col">

                    <h2 style={{ marginBottom: "20px" }}>Open a Zerodha account</h2>

                    <p className="text-muted">Modern platforms and apps, ₹0 investments, and flat ₹20 intraday and F&O trades.</p>

                    <Link 
                        to="/signup"
                        className="p-2 fs-5" 
                        style={{
                            width: "20%", 
                            minWidth: "180px",
                            margin: "0 auto", 
                            backgroundColor: "rgb(56, 126, 209)",
                            color: "white", 
                            borderRadius: 5, 
                            border: "none",
                            textDecoration: "none",
                            display: "inline-block"
                        }} 
                    >
                        Sign up for free
                    </Link>

                </div>

            </div>
                        
            <br /><br /><br /><br />
        </div>

       
    );
}

export default OpenAccount;