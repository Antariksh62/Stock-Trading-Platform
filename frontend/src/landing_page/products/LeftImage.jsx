import React from 'react';

function LeftImage({
    imageURL, 
    productName, 
    productDescription, 
    tryDemo, 
    learnMore, 
    googlePlay, 
    appStore
}) {
    return (
        <div className="container my-5 py-3">
            <div className="row align-items-center">
                
                {/* Product Screenshot */}
                <div className="col-lg-7 col-md-6 col-12 text-center mb-4 mb-md-0">
                    <img 
                        src={imageURL} 
                        alt={productName} 
                        className="img-fluid"
                        style={{ width: "90%", maxWidth: "560px" }}
                    />
                </div>

                {/* Product Details */}
                <div className="col-lg-5 col-md-6 col-12 ps-lg-5">
                    <h2 className="mb-3" style={{ fontSize: "1.85rem", fontWeight: 500, color: "#424242" }}>
                        {productName}
                    </h2>
                    
                    <p style={{ color: "#666", lineHeight: 1.8, fontSize: "0.95rem", marginBottom: "1.5rem" }}>
                        {productDescription}
                    </p>
                    
                    <div className="mb-4" style={{ display: "flex", gap: "28px" }}>
                        {tryDemo && (
                            <a href={tryDemo} style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}>
                                Try Demo &rarr;
                            </a>
                        )}
                        {learnMore && (
                            <a href={learnMore} style={{ textDecoration: "none", color: "#387ed1", fontWeight: 500, fontSize: "0.95rem" }}>
                                Learn More &rarr;
                            </a>
                        )}
                    </div>
                    
                    {(googlePlay || appStore) && (
                        <div className="d-flex align-items-center" style={{ gap: "16px" }}>
                            {googlePlay && (
                                <a href={googlePlay} target="_blank" rel="noreferrer">
                                    <img src="media/images/googlePlayBadge.svg" alt="Google Play" style={{ height: "40px" }} />
                                </a>
                            )}
                            {appStore && (
                                <a href={appStore} target="_blank" rel="noreferrer">
                                    <img src="media/images/appstoreBadge.svg" alt="App Store" style={{ height: "40px" }} />
                                </a>
                            )}
                        </div>
                    )}
                    
                </div>

            </div>
        </div>
    );
}

export default LeftImage;
