import React from 'react';

function Hero() {
    return (
        <div className="support-header py-5" style={{ backgroundColor: '#fbfbfb' }}>
            <div className="container">
                
                {/* Row 1: Title and Button */}
                <div className="row d-flex justify-content-between align-items-center mb-4">
                    <div className="col-auto">
                        <h2 className="m-0 fw-normal">Support Portal</h2>
                    </div>
                    <div className="col-auto">
                        <button className="btn text-white px-4 py-2" style={{ backgroundColor: '#387ed1', border: 'none', fontWeight: '500' }}>
                            My tickets
                        </button>
                    </div>
                </div>

                {/* Row 2: Search Bar */}
                <div className="row">
                    <div className="col-12">
                        <div className="input-group input-group-lg shadow-sm" style={{ borderRadius: '4px', overflow: 'hidden' }}>
                            <span className="input-group-text bg-white border-0 text-muted px-4">
                                🔍
                            </span>
                            <input 
                                type="text" 
                                className="form-control border-0 py-3" 
                                placeholder="Eg: How do I open my account, How do i activate F&O..." 
                                style={{ boxShadow: 'none' }}
                            />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Hero;