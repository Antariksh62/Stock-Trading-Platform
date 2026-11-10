import React from 'react';

function Footer() {
    const linkedinUrl = "https://www.linkedin.com/in/antariksh-kothari";

    const socialIconStyle = {
        color: "#666",
        fontSize: "1.15rem",
        marginRight: "18px",
        textDecoration: "none",
        transition: "color 0.2s ease, transform 0.2s ease",
        display: "inline-block",
    };

    const linkStyle = {
        color: "#666",
        textDecoration: "none",
        fontSize: "0.88rem",
        display: "block",
        marginBottom: "10px",
        transition: "color 0.15s ease",
    };

    const bottomLinkStyle = {
        color: "#9b9b9b",
        textDecoration: "none",
        fontSize: "0.72rem",
        fontWeight: "500",
        transition: "color 0.15s ease",
    };

    return (
        <footer style={{ backgroundColor: "#fbfbfb", borderTop: "1px solid #eeeeee" }} className="mt-5 pt-5">
            <div className="container">
                <div className="row">
                    {/* Brand Section */}
                    <div className="col-lg-3 col-md-4 col-12 mb-4 mb-lg-0 pe-lg-4">
                        <img 
                            src="media/images/logo.svg" 
                            alt="Zerodha Logo" 
                            style={{ width: "135px", marginBottom: "16px" }} 
                        />
                        <p style={{ fontSize: "0.82rem", color: "#666", lineHeight: "1.6", marginBottom: "16px" }}>
                            &copy; 2010 - 2026, Zerodha Broking Ltd.<br />
                            All rights reserved.
                        </p>

                        {/* Social Media Logos - Link to User LinkedIn */}
                        <div className="mb-2" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="Twitter / X (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-x-twitter"></i>
                            </a>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="Meta (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-meta"></i>
                            </a>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="Instagram (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-instagram"></i>
                            </a>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="LinkedIn (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-linkedin-in"></i>
                            </a>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="YouTube (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-youtube"></i>
                            </a>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="WhatsApp (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-whatsapp"></i>
                            </a>
                            <a 
                                href={linkedinUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={socialIconStyle}
                                title="Telegram (Connect with Antariksh Kothari)"
                            >
                                <i className="fa-brands fa-telegram"></i>
                            </a>
                        </div>
                    </div>

                    {/* Column 1: Account */}
                    <div className="col-lg-2 col-md-4 col-6 mb-4">
                        <p style={{ fontWeight: 500, fontSize: "1rem", color: "#424242", marginBottom: "14px" }}>Account</p>
                        <a href="/signup" style={linkStyle}>Open demat account</a>
                        <a href="/signup" style={linkStyle}>Minor demat account</a>
                        <a href="/signup" style={linkStyle}>NRI demat account</a>
                        <a href="/signup" style={linkStyle}>HUF demat account</a>
                        <a href="/pricing" style={linkStyle}>Commodity</a>
                        <a href="/supportpage" style={linkStyle}>Dematerialisation</a>
                        <a href="/dashboard" style={linkStyle}>Fund transfer</a>
                        <a href="/pricing" style={linkStyle}>MTF</a>
                    </div>

                    {/* Column 2: Support */}
                    <div className="col-lg-2 col-md-4 col-6 mb-4">
                        <p style={{ fontWeight: 500, fontSize: "1rem", color: "#424242", marginBottom: "14px" }}>Support</p>
                        <a href="/supportpage" style={linkStyle}>Contact us</a>
                        <a href="/supportpage" style={linkStyle}>Support portal</a>
                        <a href="/supportpage" style={linkStyle}>How to file a complaint?</a>
                        <a href="/supportpage" style={linkStyle}>Status of your complaints</a>
                        <a href="/supportpage" style={linkStyle}>Bulletin</a>
                        <a href="/supportpage" style={linkStyle}>Circular</a>
                        <a href="/supportpage" style={linkStyle}>Z-Connect blog</a>
                        <a href="/supportpage" style={linkStyle}>Downloads</a>
                    </div>

                    {/* Column 3: Company */}
                    <div className="col-lg-2 col-md-4 col-6 mb-4">
                        <p style={{ fontWeight: 500, fontSize: "1rem", color: "#424242", marginBottom: "14px" }}>Company</p>
                        <a href="/aboutpage" style={linkStyle}>About</a>
                        <a href="/aboutpage" style={linkStyle}>Philosophy</a>
                        <a href="/aboutpage" style={linkStyle}>Press & media</a>
                        <a href="/aboutpage" style={linkStyle}>Careers</a>
                        <a href="/aboutpage" style={linkStyle}>Zerodha Cares (CSR)</a>
                        <a href="/productpage" style={linkStyle}>Zerodha.tech</a>
                        <a href="/productpage" style={linkStyle}>Open source</a>
                        <a href="/pricing" style={linkStyle}>Referral program</a>
                    </div>

                    {/* Column 4: Quick Links */}
                    <div className="col-lg-3 col-md-4 col-6 mb-4">
                        <p style={{ fontWeight: 500, fontSize: "1rem", color: "#424242", marginBottom: "14px" }}>Quick Links</p>
                        <a href="/productpage" style={linkStyle}>Upcoming IPOs</a>
                        <a href="/pricing" style={linkStyle}>Brokerage charges</a>
                        <a href="/supportpage" style={linkStyle}>Market holidays</a>
                        <a href="/dashboard" style={linkStyle}>Economic calendar</a>
                        <a href="/pricing" style={linkStyle}>Calculators</a>
                        <a href="/dashboard" style={linkStyle}>Markets</a>
                        <a href="/dashboard" style={linkStyle}>Sectors</a>
                        <a href="/dashboard" style={linkStyle}>Gift Nifty</a>
                    </div>
                </div>

                {/* Legal Fine Print Section (Airy, Muted, Matching Official Zerodha Pic 2) */}
                <div 
                    className="mt-5 pt-4" 
                    style={{ 
                        borderTop: "1px solid #eeeeee", 
                        fontSize: "0.68rem", 
                        lineHeight: "1.85", 
                        color: "#9b9b9b" 
                    }}
                >
                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        Zerodha Broking Limited: Member of NSE, BSE, MCX & MSEI – SEBI Registration no.: INZ000031633 CDSL/NSDL: Depository services through Zerodha Broking Limited – SEBI Registration no.: IN-DP-431-2019, CIN: U65929KA2018PLC116815, Registered Address: #153/154, 4th Cross, Dollars Colony, Opp. Clarence Public School, J.P Nagar 4th Phase, Bengaluru - 560078, Karnataka, India. For any complaints pertaining to securities broking please write to <a href="mailto:complaints@zerodha.com" style={{ color: "#387ed1", textDecoration: "none" }}>complaints@zerodha.com</a>, for DP related to <a href="mailto:dp@zerodha.com" style={{ color: "#387ed1", textDecoration: "none" }}>dp@zerodha.com</a>. Please ensure you carefully read the Risk Disclosure Document as prescribed by SEBI | ICF
                    </p>

                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        Procedure to file a complaint on SEBI SCORES/SMARTODR: Register on SCORES portal & SMARTODR. Mandatory details for filing complaints on SCORES: Name, PAN, Address, Mobile Number, E-mail ID. Benefits: Effective Communication, Speedy redressal of grievances.
                    </p>

                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        <a href="https://smartodr.in/" target="_blank" rel="noreferrer" style={{ color: "#387ed1", textDecoration: "none" }}>Smart Online Dispute Resolution</a> | <a href="/supportpage" style={{ color: "#387ed1", textDecoration: "none" }}>Grievances Redressal Mechanism</a> | <a href="https://investor.sebi.gov.in/" target="_blank" rel="noreferrer" style={{ color: "#387ed1", textDecoration: "none" }}>Project Jugrook by SEBI</a>
                    </p>

                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        Investments in securities market are subject to market risks; read all the related documents carefully before investing.
                    </p>

                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        Attention Investors: 1) Stock brokers can accept securities as margins from clients only by way of pledge in the depository system w.e.f September 01, 2020. 2) Update your e-mail and phone number with your stock broker / depository participant and receive OTP directly from depository on your e-mail and/or mobile number to create pledge. 3) Check your securities / MF / bonds in the consolidated account statement issued by NSDL/CDSL every month.
                    </p>

                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        India's largest broker based on networth as per NSE. <a href="https://www.nseindia.com/" target="_blank" rel="noreferrer" style={{ color: "#387ed1", textDecoration: "none" }}>NSE broker factsheet</a>
                    </p>
                    
                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        "Prevent unauthorised transactions in your account. Update your mobile numbers/email IDs with your stock brokers/depository participants. Receive information of your transactions directly from Exchange/Depositories on your mobile/email at the end of the day. Issued in the interest of investors. KYC is one time exercise while dealing in securities markets - once KYC is done through a SEBI registered intermediary (broker, DP, Mutual Fund etc.), you need not undergo the same process again when you approach another intermediary." Dear Investor, if you are subscribing to an IPO, there is no need to issue a cheque. Please write the Bank account number and sign the IPO application form to authorize your bank to make payment in case of allotment. In case of non allotment the funds will remain in your bank account. As a business we don't give stock tips, and have not authorized anyone to trade on behalf of others. If you find anyone claiming to be part of Zerodha and offering such services, please <a href="/supportpage" style={{ color: "#387ed1", textDecoration: "none" }}>create a ticket here</a>.
                    </p>

                    <p style={{ marginBottom: "12px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        *Customers availing insurance advisory services offered by Ditto (Tacterial Consulting Private Limited | IRDAI Registered Corporate Agent (Composite) License No CA0738) will not have access to the exchange investor grievance redressal forum, SEBI SCORES/ODR, or arbitration mechanism for such products.
                    </p>

                    <p style={{ marginBottom: "16px", color: "#9b9b9b", fontSize: "0.68rem" }}>
                        Fixed deposit products offered on this platform are third-party products (TPP) and are not Exchange traded products. These are offered through Blostem Fintech Private Limited. Zerodha Broking Limited (SEBI Registration No.: INZ000031633) is acting solely as a distributor for these products. Any disputes arising with respect to such distribution activity will not have access to SEBI SCORES/ODR, Exchange Investor Grievance Redressal Forum, or Arbitration mechanism. Fixed deposits are regulated by the Reserve Bank of India (RBI).
                    </p>

                    {/* Bottom Nav Links Matching Pic 2 */}
                    <div 
                        className="d-flex flex-wrap justify-content-center pt-3 pb-5" 
                        style={{ gap: "22px", borderTop: "1px solid #f2f2f2" }}
                    >
                        <a href="https://www.nseindia.com/" target="_blank" rel="noreferrer" style={bottomLinkStyle}>NSE</a>
                        <a href="https://www.bseindia.com/" target="_blank" rel="noreferrer" style={bottomLinkStyle}>BSE</a>
                        <a href="https://www.mcxindia.com/" target="_blank" rel="noreferrer" style={bottomLinkStyle}>MCX</a>
                        <a href="https://www.msei.in/" target="_blank" rel="noreferrer" style={bottomLinkStyle}>MSEI</a>
                        <a href="/supportpage" style={bottomLinkStyle}>Terms &amp; conditions</a>
                        <a href="/supportpage" style={bottomLinkStyle}>Policies &amp; procedures</a>
                        <a href="/supportpage" style={bottomLinkStyle}>Privacy policy</a>
                        <a href="/supportpage" style={bottomLinkStyle}>Disclosure</a>
                        <a href="/supportpage" style={bottomLinkStyle}>For investor's attention</a>
                        <a href="/supportpage" style={bottomLinkStyle}>Investor charter</a>
                        <a href="/supportpage" style={bottomLinkStyle}>Sitemap</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export default Footer;
