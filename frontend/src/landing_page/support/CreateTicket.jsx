import React, { useState } from 'react';

function CreateTicket() {
    // State to track which accordion is open
    const [openTopic, setOpenTopic] = useState(null);

    // Toggle function
    const handleToggle = (id) => {
        setOpenTopic(openTopic === id ? null : id);
    };

    // Full data array containing all links from your images
    const supportTopics = [
        { 
            id: 1, 
            icon: '⊕', 
            title: 'Account Opening',
            links: ['Resident individual', 'Minor', 'Non Resident Indian (NRI)', 'Company, Partnership, HUF and LLP', 'Glossary']
        },
        { 
            id: 2, 
            icon: '👤', 
            title: 'Your Zerodha Account',
            links: ['Your Profile', 'Account modification', 'Client Master Report (CMR) and Depository Participant (DP)', 'Nomination', 'Transfer and conversion of securities']
        },
        { 
            id: 3, 
            icon: '🪁', 
            title: 'Kite',
            links: ['IPO', 'Trading FAQs', 'Margin Trading Facility (MTF) and Margins', 'Charts and orders', 'Alerts and Nudges', 'General']
        }, 
        { 
            id: 4, 
            icon: '₹', 
            title: 'Funds',
            links: ['Add money', 'Withdraw money', 'Add bank accounts', 'eMandates']
        },
        { 
            id: 5, 
            icon: '◎', 
            title: 'Console',
            links: ['Portfolio', 'Corporate actions', 'Funds statement', 'Reports', 'Profile', 'Segments']
        },
        { 
            id: 6, 
            icon: '🪙', 
            title: 'Coin',
            links: ['Mutual funds', 'National Pension Scheme (NPS)', 'Fixed Deposit (FD)', 'Features on Coin', 'Payments and Orders', 'General']
        },
    ];

    return (
        <div className="container mt-5 mb-5">
            <div className="row">
                
                {/* Left Column - Expandable Topics List */}
                <div className="col-lg-8 pe-lg-5">
                    {supportTopics.map((topic) => {
                        const isOpen = openTopic === topic.id;
                        
                        return (
                            <div key={topic.id} className="mb-3">
                                {/* Accordion Header */}
                                <div 
                                    className="d-flex align-items-center justify-content-between p-3 bg-white" 
                                    onClick={() => handleToggle(topic.id)}
                                    style={{ 
                                        border: isOpen ? '2px solid black' : '1px solid #e0e0e0',
                                        borderRadius: '4px', 
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease-in-out'
                                    }}
                                >
                                    <div className="d-flex align-items-center" style={{ color: '#387ed1' }}>
                                        <span className="me-3 fs-5" style={{ width: '24px', textAlign: 'center' }}>{topic.icon}</span>
                                        <span className="text-dark fs-6" style={{ fontWeight: '400' }}>{topic.title}</span>
                                    </div>
                                    <span style={{ color: '#387ed1' }}>
                                        {/* Chevron Icon - flips when open */}
                                        <svg 
                                            xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"
                                            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                        >
                                          <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                                        </svg>
                                    </span>
                                </div>

                                {/* Accordion Body (Links) */}
                                {isOpen && (
                                    <div className="p-4 pt-3 border-start border-end border-bottom" style={{ borderColor: '#e0e0e0', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' }}>
                                        <ul className="list-unstyled mb-0" style={{ paddingLeft: '32px' }}>
                                            {topic.links.map((link, index) => (
                                                <li key={index} className="mb-3 d-flex align-items-center">
                                                    <span className="me-2" style={{ color: '#387ed1', fontSize: '10px' }}>●</span>
                                                    <a href="#" className="text-decoration-none" style={{ color: '#387ed1', fontSize: '0.95rem' }}>
                                                        {link}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Right Column - Updates & Quick Links */}
                <div className="col-lg-4 mt-4 mt-lg-0">
                    <div className="p-4 mb-4" style={{ backgroundColor: '#fdf6ed', borderLeft: '5px solid #ff9800', borderRadius: '4px' }}>
                        <ul className="mb-0 ps-3" style={{ lineHeight: '1.8' }}>
                            <li><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>Rights Entitlements listing in July 2026</a></li>
                            <li><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>Surveillance measure on scrips - July 2026</a></li>
                        </ul>
                    </div>

                    <div className="border" style={{ borderRadius: '4px', overflow: 'hidden' }}>
                        <div className="p-3 border-bottom" style={{ backgroundColor: '#f8f9fa' }}>
                            <h6 className="m-0 text-dark fw-normal">Quick links</h6>
                        </div>
                        <div className="p-0">
                            <ul className="list-group list-group-flush">
                                <li className="list-group-item p-3"><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>1. Track account opening</a></li>
                                <li className="list-group-item p-3"><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>2. Track segment activation</a></li>
                                <li className="list-group-item p-3"><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>3. Intraday margins</a></li>
                                <li className="list-group-item p-3"><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>4. Kite user manual</a></li>
                                <li className="list-group-item p-3"><a href="#" className="text-decoration-none" style={{ color: '#387ed1' }}>5. Learn how to create a ticket</a></li>
                            </ul>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default CreateTicket;