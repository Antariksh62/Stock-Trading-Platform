import React from 'react';

function RightImage({
    imageURL, 
    productName, 
    productDescription, 
    learnMore, 
}) 

{
    return (
        <div className="container">

            <div className="row p-5">

                
                <div className="col-4 p-5 mt-2">
                    <h1>{productName}</h1>
                    <br />
                    <p>{productDescription}</p>
                    
                    <div>
                        <a href={learnMore} style={{}}>
                        Learn More
                        </a>
                    </div>
                </div>


                <div className="col-8 p-5" style={ {marginRight : ""} }>
                    <img src={imageURL} alt="" style={ {width : "90%"} }/>
                </div>


            </div>
        </div>
    );
}

export default RightImage;