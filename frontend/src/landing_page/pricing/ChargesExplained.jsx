import React from 'react';

function ChargesExplained() {
    return (
        <div className="container mx-auto px-4 py-10 max-w-6xl">
            <h3 className="text-2xl font-medium mb-10 text-gray-800">Charges explained</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10 text-sm text-gray-600 mb-16">
                
                {/* Column 1 */}
                <div className="space-y-8">
                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Securities/Commodities transaction tax</h4>
                        <p className="mb-4">Tax by the government when transacting on the exchanges. Charged as above on both buy and sell sides when trading equity delivery. Charged only on selling side when trading intraday or on F&O.</p>
                        <p>When trading at Zerodha, STT/CTT can be a lot more than the brokerage we charge. Important to keep a tab.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Transaction/Turnover Charges</h4>
                        <p className="mb-4">Charged by exchanges (NSE, BSE, MCX) on the value of your transactions.</p>
                        <p className="mb-4">BSE has revised transaction charges in XC, XD, XT, Z and ZP groups to ₹10,000 per crore w.e.f 01.01.2016. (XC and XD groups have been merged into a new group X w.e.f 01.12.2017)</p>
                        <p className="mb-4">BSE has revised transaction charges in SS and ST groups to ₹1,00,000 per crore of gross turnover.</p>
                        <p className="mb-4">BSE has revised transaction charges for group A, B and other non exclusive scrips (non-exclusive scrips from group E, F, FC, G, GC, W, T) at ₹375 per crore of turnover on flat rate basis w.e.f. December 1, 2022.</p>
                        <p>BSE has revised transaction charges in M, MT, TS and MS groups to ₹275 per crore of gross turnover.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Call & trade</h4>
                        <p>Additional charges of ₹50 per order for orders placed through a dealer at Zerodha including auto square off orders.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Stamp charges</h4>
                        <p>Stamp charges by the Government of India as per the Indian Stamp Act of 1899 for transacting in instruments on the stock exchanges and depositories.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">NRI brokerage charges</h4>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>For a non-PIS account, 0.5% or ₹50 per executed order for equity and F&O (whichever is lower).</li>
                            <li>For a PIS account, 0.5% or ₹200 per executed order for equity (whichever is lower).</li>
                            <li>₹500 + GST as yearly account maintenance charges (AMC) charges.</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Account with debit balance</h4>
                        <p>If the account is in debit balance, any order placed will be charged ₹40 per executed order instead of ₹20 per executed order.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Charges for Investor's Protection Fund Trust (IPFT) by NSE</h4>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>Equity and Futures - ₹0.01 per crore + GST of the traded value.</li>
                            <li>Options - ₹0.01 per crore + GST traded value (premium value).</li>
                            <li>Currency - ₹0.05 per lakh + GST of turnover for Futures and ₹2 per lakh + GST of premium for Options.</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Margin Trading Facility (MTF)</h4>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>MTF Interest: 0.04% per day (₹40 per lakh) on the funded amount. The interest is applied from T+1 day until the day MTF stocks are sold.</li>
                            <li>MTF Brokerage: 0.3% or Rs. 20/executed order, whichever is lower.</li>
                            <li>MTF pledge charge: ₹15 + GST per pledge and unpledge request per ISIN.</li>
                        </ul>
                    </div>
                </div>

                {/* Column 2 */}
                <div className="space-y-8">
                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">GST</h4>
                        <p>Tax levied by the government on the services rendered. 18% of ( brokerage + SEBI charges + transaction charges)</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">SEBI Charges</h4>
                        <p>Charged at ₹10 per crore + GST by Securities and Exchange Board of India for regulating the markets.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">DP (Depository participant) charges</h4>
                        <p className="mb-4">₹15.34 per scrip (₹3.5 CDSL fee + ₹9.5 Zerodha fee + ₹2.34 GST) is charged on the trading account ledger when stocks are sold, irrespective of quantity.</p>
                        <p className="mb-4">Female demat account holders (as first holder) will enjoy a discount of ₹0.25 per transaction on the CDSL fee.</p>
                        <p>Debit transactions of mutual funds & bonds get an additional discount of ₹0.25 on the CDSL fee.</p>
                    </div>
                    
                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Pledging charges</h4>
                        <p>₹30 + GST per pledge request per ISIN.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">AMC (Account maintenance charges)</h4>
                        <p className="mb-4">Free for the first year on all new resident individual accounts.</p>
                        <p className="mb-4">For BSDA demat account: Zero charges if the holding value is less than ₹4,00,000. To learn more about BSDA, <a href="#" className="text-blue-600 hover:underline">Click here</a></p>
                        <p>For non-BSDA demat accounts: ₹300/year + 18% GST charged quarterly (90 days). To learn more about AMC, <a href="#" className="text-blue-600 hover:underline">Click here</a></p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Corporate action order charges</h4>
                        <p>₹20 plus GST will be charged for OFS / buyback / takeover / delisting orders placed through Console.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Off-market transfer charges</h4>
                        <p>₹25 per transaction.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Physical CMR request</h4>
                        <p>First CMR request is free. ₹20 + ₹100 (courier charge) + 18% GST for subsequent requests.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Payment gateway charges</h4>
                        <p>₹9 + GST (Not levied on transfers done via UPI)</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Delayed Payment Charges</h4>
                        <p>Interest is levied at 18% a year or 0.05% per day on the debit balance in your trading account. <a href="#" className="text-blue-600 hover:underline">Learn more</a>.</p>
                    </div>

                    <div>
                        <h4 className="text-lg font-medium text-gray-800 mb-3">Trading using 3-in-1 account with block functionality</h4>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>Delivery & MTF Brokerage: 0.5% per executed order.</li>
                            <li>Intraday Brokerage: 0.05% per executed order.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Disclaimer Section */}
            <div className="pt-10 border-t border-gray-200">
                <h4 className="text-xl font-medium text-gray-800 mb-4">Disclaimer</h4>
                <p className="text-sm text-gray-500 leading-relaxed">
                    For Delivery based trades, a minimum of ₹0.01 will be charged per contract note. Clients who opt to receive physical contract notes will be charged ₹20 per contract note plus courier charges. Brokerage will not exceed the rates specified by SEBI and the exchanges. All statutory and regulatory charges will be levied at actuals. Brokerage is also charged on expired, exercised, and assigned options contracts. Free investments are available only for our retail individual clients. Companies, Partnerships, Trusts, and HUFs need to pay 0.1% or ₹20 (whichever is less) as delivery brokerage. A brokerage of 0.25% of the contract value will be charged for contracts where physical delivery happens. For netted off positions in physically settled contracts, a brokerage of 0.1% will be charged.
                </p>
            </div>
            
        </div>
    );
}

export default ChargesExplained;