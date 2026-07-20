import React from 'react';

function Footer() {
    return (
        <footer style={{ backgroundColor: "#fbfbfb" }} className="border-top">
            <div className="container">
                <div className="row mt-5">
                    {/* Brand Section */}
                    <div className="col">
                        <img src="media/images/logo.svg" alt="Zerodha Logo" style={{ width: "50%", marginBottom: "20px" }} />
                        <p className="text-muted" style={{ fontSize: "14px" }}>
                            &copy; 2010 - 2026, Zerodha Broking Ltd.<br />
                            All rights reserved.
                        </p>
                        <div className="fs-5 text-muted mb-3">
                            <i className="fa-brands fa-x-twitter me-3"></i>
                            <i className="fa-brands fa-meta me-3"></i>
                            <i className="fa-brands fa-instagram me-3"></i>
                            <i className="fa-brands fa-linkedin-in me-3"></i>
                        </div>
                        <div className="fs-5 text-muted">
                            <i className="fa-brands fa-youtube me-3"></i>
                            <i className="fa-brands fa-whatsapp me-3"></i>
                            <i className="fa-brands fa-telegram me-3"></i>
                        </div>
                    </div>

                    {/* Links Section 1 */}
                    <div className="col">
                        <p className="fw-bold mb-3">Account</p>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Open demat account</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Minor demat account</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">NRI demat account</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">HUF demat account</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Commodity</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Dematerialisation</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Fund transfer</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">MTF</a></div>
                    </div>

                    {/* Links Section 2 */}
                    <div className="col">
                        <p className="fw-bold mb-3">Support</p>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Contact us</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Support portal</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">How to file a complaint?</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Status of your complaints</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Bulletin</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Circular</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Z-Connect blog</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Downloads</a></div>
                    </div>

                    {/* Links Section 3 */}
                    <div className="col">
                        <p className="fw-bold mb-3">Company</p>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">About</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Philosophy</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Press & media</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Careers</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Zerodha Cares (CSR)</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Zerodha.tech</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Open source</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Referral program</a></div>
                    </div>

                    {/* Links Section 4 */}
                    <div className="col">
                        <p className="fw-bold mb-3">Quick Links</p>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Upcoming IPOs</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Brokerage charges</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Market holidays</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Economic calendar</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Calculators</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Markets</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Sectors</a></div>
                        <div className="mb-2"><a href="" className="text-decoration-none text-muted">Gift Nifty</a></div>
                    </div>
                </div>

                {/* Legal Fine Print Section */}
                <div className="mt-5 text-muted" style={{ fontSize: "12px", lineHeight: "1.8" }}>
                    <p>Zerodha Broking Ltd.: Member of NSE, BSE, MCX & MSEI – SEBI Registration no.: INZ000031633 CDSL/NSDL: Depository services through Zerodha Broking Ltd. – SEBI Registration no.: IN-DP-431-2019 Registered Address: Zerodha Broking Ltd., #153/154, 4th Cross, Dollars Colony, Opp. Clarence Public School, J.P Nagar 4th Phase, Bengaluru - 560078, Karnataka, India. For any complaints pertaining to securities broking please write to complaints@zerodha.com, for DP related to dp@zerodha.com. Please ensure you carefully read the Risk Disclosure Document as prescribed by SEBI | ICF</p>

                    <p>Procedure to file a complaint on SEBI SCORES: Register on SCORES portal. Mandatory details for filing complaints on SCORES: Name, PAN, Address, Mobile Number, E-mail ID. Benefits: Effective Communication, Speedy redressal of the grievances</p>

                    <p>Smart Online Dispute Resolution | Grievances Redressal Mechanism</p>

                    <p>Investments in securities market are subject to market risks; read all the related documents carefully before</p>

                    <p>Attention investors: 1) Stock brokers can accept securities as margins from clients only by way of pledge in the depository system w.e.f September 01, 2020. 2) Update your e-mail and phone number with your stock broker / depository participant and receive OTP directly from depository on your e-mail and/or mobile number to create pledge. 3) Check your securities / MF / bonds in the consolidated account statement issued by NSDL/CDSL every month.</p>

                    <p>India's largest broker based on networth as per NSE. NSE broker factsheet</p>
                    
                    <p>"Prevent unauthorised transactions in your account. Update your mobile numbers/email IDs with your stock brokers/depository participants. Receive information of your transactions directly from Exchange/Depositories on your mobile/email at the end of the day. Issued in the interest of investors. KYC is one time exercise while dealing in securities markets - once KYC is done through a SEBI registered intermediary (broker, DP, Mutual Fund etc.), you need not undergo the same process again when you approach another intermediary." Dear Investor, if you are subscribing to an IPO, there is no need to issue a cheque. Please write the Bank account number and sign the IPO application form to authorize your bank to make payment in case of allotment. In case of non allotment the funds will remain in your bank account. As a business we don't give stock tips, and have not authorized anyone to trade on behalf of others. If you find anyone claiming to be part of Zerodha and offering such services, please create a ticket here.</p>
                    <p>*Customers availing insurance advisory services offered by Ditto (Tacterial Consulting Private Limited | IRDAI Registered Corporate Agent (Composite) License No CA0738) will not have access to the exchange investor grievance redressal forum, SEBI SCORES/ODR, or arbitration mechanism for such products.</p>
                    <p className="pb-5">Fixed deposit products offered on this platform are third-party products (TPP) and are not Exchange traded products. These are offered through Blostem Fintech Private Limited. Zerodha Broking Limited (SEBI Registration No.: INZ000031633) is acting solely as a distributor for these products. Any disputes arising with respect to such distribution activity will not have access to SEBI SCORES/ODR, Exchange Investor Grievance Redressal Forum, or Arbitration mechanism. Fixed deposits are regulated by the Reserve Bank of India (RBI).</p>
                </div>
            </div>
        </footer>
    );
}

export default Footer;