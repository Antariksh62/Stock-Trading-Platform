import React from 'react';

function Hero() {
    return (
        <div className="container mx-auto px-4 py-20 text-center max-w-6xl">
            <h1 className="text-4xl font-medium mb-3 text-gray-800">Charges</h1>
            <p className="text-xl text-gray-500 mb-20">List of all charges and taxes</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
                <div className="flex flex-col items-center">
                    <img src="media/images/pricing0.svg" alt="₹0 Brokerage" className="mb-6 h-40" />
                    <h2 className="text-2xl font-medium mb-4 text-gray-800">Free equity delivery</h2>
                    <p className="text-gray-600 leading-relaxed px-4">
                        All equity delivery investments (NSE, BSE), are absolutely free — ₹ 0 brokerage.
                    </p>
                </div>

                <div className="flex flex-col items-center">
                    <img src="media/images/intradayTrades.svg" alt="₹20 Brokerage" className="mb-6 h-40" />
                    <h2 className="text-2xl font-medium mb-4 text-gray-800">Intraday and F&O trades</h2>
                    <p className="text-gray-600 leading-relaxed px-4">
                        Flat ₹ 20 or 0.03% (whichever is lower) per executed order on intraday trades across equity, currency, and commodity trades. Flat ₹20 on all option trades.
                    </p>
                </div>

                <div className="flex flex-col items-center">
                    <img src="media/images/pricing0.svg" alt="₹0 Brokerage" className="mb-6 h-40" />
                    <h2 className="text-2xl font-medium mb-4 text-gray-800">Free direct MF</h2>
                    <p className="text-gray-600 leading-relaxed px-4">
                        All direct mutual fund investments are absolutely free — ₹ 0 commissions & DP charges.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Hero;