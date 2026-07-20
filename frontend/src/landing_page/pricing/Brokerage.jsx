import React, { useState } from 'react';

function Brokerage() {
    const [activeTab, setActiveTab] = useState('equity');

    return (
        <div className="container mx-auto px-4 py-10 max-w-6xl">
            <div className="flex space-x-12 border-b border-gray-200 mb-8">
                <button
                    className={`pb-4 text-xl font-medium ${activeTab === 'equity' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
                    onClick={() => setActiveTab('equity')}
                >
                    Equity
                </button>
                <button
                    className={`pb-4 text-xl font-medium ${activeTab === 'currency' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
                    onClick={() => setActiveTab('currency')}
                >
                    Currency
                </button>
                <button
                    className={`pb-4 text-xl font-medium ${activeTab === 'commodity' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
                    onClick={() => setActiveTab('commodity')}
                >
                    Commodity
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                        <tr className="border-b border-gray-200 text-gray-600">
                            <th className="py-4 pr-6 font-normal w-1/5"></th>
                            <th className="py-4 px-6 font-normal">Equity delivery</th>
                            <th className="py-4 px-6 font-normal">Equity intraday</th>
                            <th className="py-4 px-6 font-normal">F&O - Futures</th>
                            <th className="py-4 px-6 font-normal">F&O - Options</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm text-gray-700">
                        <tr className="border-b border-gray-100">
                            <td className="py-6 pr-6 text-gray-500">Brokerage</td>
                            <td className="py-6 px-6">Zero Brokerage</td>
                            <td className="py-6 px-6">0.03% or Rs. 20/executed<br/>order whichever is lower</td>
                            <td className="py-6 px-6">0.03% or Rs. 20/executed<br/>order whichever is lower</td>
                            <td className="py-6 px-6">Flat Rs. 20 per executed order</td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-6 pr-6 text-gray-500">STT/CTT</td>
                            <td className="py-6 px-6">0.1% on buy & sell</td>
                            <td className="py-6 px-6">0.025% on the sell side</td>
                            <td className="py-6 px-6">0.05% on the sell side</td>
                            <td className="py-6 px-6">
                                <ul className="list-disc pl-4 space-y-2">
                                    <li>0.15% of the intrinsic value on options that are bought and exercised</li>
                                    <li>0.15% on sell side (on premium)</li>
                                </ul>
                            </td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-6 pr-6 text-gray-500">Transaction charges</td>
                            <td className="py-6 px-6">NSE: 0.00307%<br/>BSE: 0.00375%</td>
                            <td className="py-6 px-6">NSE: 0.00307%<br/>BSE: 0.00375%</td>
                            <td className="py-6 px-6">NSE: 0.00183%<br/>BSE: 0</td>
                            <td className="py-6 px-6">NSE: 0.03553% (on premium)<br/>BSE: 0.0325% (on premium)</td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-6 pr-6 text-gray-500">GST</td>
                            <td className="py-6 px-6">18% on (brokerage + SEBI<br/>charges + transaction charges)</td>
                            <td className="py-6 px-6">18% on (brokerage + SEBI<br/>charges + transaction charges)</td>
                            <td className="py-6 px-6">18% on (brokerage + SEBI<br/>charges + transaction charges)</td>
                            <td className="py-6 px-6">18% on (brokerage + SEBI<br/>charges + transaction charges)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="text-center mt-10 text-lg">
                <a href="#" className="text-blue-600 hover:text-blue-700">Calculate your costs upfront</a> <span className="text-gray-600">using our brokerage calculator</span>
            </div>
        </div>
    );
}

export default Brokerage;