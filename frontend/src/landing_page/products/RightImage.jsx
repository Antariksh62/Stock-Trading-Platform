import React from 'react';

function RightImage({
    imageURL, 
    productName, 
    productDescription, 
    learnMore, 
}) {
    return (
        <div className="container my-5 py-3">
            <div className="row align-items-center">

                {/* Product Text Details */}
                <div className="col-lg-5 col-md-6 col-12 pe-lg-5 mb-4 mb-md-0">
                    <h2 className="mb-3" style={{ fontSize: "1.85rem", fontWeight: 500, color: "#424242" }}>
                        {productName}
                    </h2>
                    
                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                        {productDescription}
                    </p>
                    
                    <div>
                        <a 
                            href={learnMore || "/productpage"} 
                            style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}
                        >
                            Learn More &rarr;
                        </a>
                    </div>
                </div>

                {/* Product Image / Console Code Graphic */}
                <div className="col-lg-7 col-md-6 col-12 text-center">
                    <img 
                        src={imageURL} 
                        alt={productName} 
                        className="img-fluid"
                        style={{ width: "90%", maxWidth: "560px" }}
                    />
                </div>

            </div>
        </div>
    );
}

export default RightImage;
