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
        <div className="container">
            <div className="row p-5">
                
                <div className="col-8 p-5" style={ {marginRight : ""} }>
                    <img src={imageURL} alt="" style={ {width : "90%"} }/>
                </div>

                <div className="col-4 p-5 mt-5">
                    <h1>{productName}</h1>
                    <br />
                    <p>{productDescription}</p>
                    
                    <div>
                        <a href={tryDemo}>Try Demo</a>
                        <a href={learnMore} style={{ marginLeft: "50px" }}>
                            Learn More
                        </a>
                    </div>
                    
                    <div className="mt-3">
                        <a href={googlePlay} style={ {marginRight : "20px"}  }>
                            <img src="media/images/googlePlayBadge.svg" alt="Google Play" />
                        </a>
                        <a href={appStore}>
                            <img src="media/images/appstoreBadge.svg" alt="App Store" />
                        </a>
                    </div>
                    
                </div>

            </div>
        </div>
    );
}

export default LeftImage;